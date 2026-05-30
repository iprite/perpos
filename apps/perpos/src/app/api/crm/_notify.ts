/**
 * CRM LINE Notification Helpers
 *
 * Shared push-notification logic for CRM events:
 *   - notifyIssueNote     → แจ้งเมื่อมี issue note ใหม่
 *   - notifyStatusChange  → แจ้งเมื่อ solution เปลี่ยน status
 *
 * All functions are fire-and-forget (never throw to caller).
 */

import { createAdminClient } from '../_lib/supabase';
import { sendLineMessages } from '@/lib/line/send-messages';

type Admin = ReturnType<typeof createAdminClient>;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** ดึง slug ขององค์กร */
async function getOrgSlug(admin: Admin, orgId: string): Promise<string> {
  const { data } = await admin
    .from('organizations')
    .select('slug')
    .eq('id', orgId)
    .maybeSingle();
  return (data as { slug?: string } | null)?.slug ?? '';
}

/** ดึง LINE user IDs ของ assignee + manager/owner ของ org นั้น (ยกเว้น excludeUserId) */
async function getCrmRecipients(
  admin: Admin,
  orgId: string,
  solutionAssignedTo: string | null,
  excludeUserId: string,
  includeManagers: boolean,
): Promise<string[]> {
  const userIds = new Set<string>();

  // assignee
  if (solutionAssignedTo && solutionAssignedTo !== excludeUserId) {
    userIds.add(solutionAssignedTo);
  }

  // manager / owner (สำหรับ issue alerts)
  if (includeManagers) {
    const { data: managers } = await admin
      .from('module_members')
      .select('user_id')
      .eq('org_id', orgId)
      .eq('module_key', 'crm')
      .eq('is_active', true)
      .in('role', ['owner', 'manager']);

    for (const m of managers ?? []) {
      if ((m as { user_id: string }).user_id !== excludeUserId) {
        userIds.add((m as { user_id: string }).user_id);
      }
    }
  }

  if (userIds.size === 0) return [];

  const { data: profiles } = await admin
    .from('profiles')
    .select('line_user_id')
    .in('id', Array.from(userIds))
    .not('line_user_id', 'is', null);

  return (profiles ?? [])
    .map((p: { line_user_id?: string | null }) => p.line_user_id!)
    .filter(Boolean);
}

/** ย่อ content สำหรับ preview (ลบ markdown syntax) */
function preview(content: string, maxLen = 120): string {
  const stripped = content.replace(/[#*`>\[\]_~]/g, '').trim();
  return stripped.length > maxLen ? stripped.slice(0, maxLen) + '…' : stripped;
}

/** Flex Bubble สำหรับ Issue alert */
function issueFlexBubble(opts: {
  solutionTitle: string;
  authorName: string;
  contentPreview: string;
  deepLink: string;
}) {
  return {
    type: 'bubble',
    size: 'kilo',
    header: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '12px',
      background: {
        type: 'linearGradient',
        angle: '135deg',
        startColor: '#E11D48',
        endColor: '#FB7185',
      },
      contents: [{
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        alignItems: 'center',
        contents: [
          { type: 'text', text: '🚨', size: 'sm', flex: 0 },
          { type: 'text', text: 'Issue ใหม่', color: '#FFFFFF', weight: 'bold', size: 'sm' },
        ],
      }],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      paddingAll: '16px',
      contents: [
        { type: 'text', text: opts.solutionTitle, weight: 'bold', size: 'md', wrap: true, color: '#0F172A' },
        {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#F8FAFC',
          cornerRadius: 'md',
          paddingAll: '10px',
          borderWidth: '1px',
          borderColor: '#E2E8F0',
          contents: [
            { type: 'text', text: opts.contentPreview, size: 'sm', color: '#475569', wrap: true, maxLines: 4, style: 'italic' },
          ],
        },
        {
          type: 'box',
          layout: 'horizontal',
          spacing: 'xs',
          alignItems: 'center',
          contents: [
            { type: 'text', text: '👤', size: 'xs', flex: 0 },
            { type: 'text', text: `รายงานโดย: ${opts.authorName}`, size: 'xs', color: '#64748B', weight: 'bold' },
          ],
        },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '12px',
      contents: [{
        type: 'button',
        action: { type: 'uri', label: 'ดูรายละเอียด', uri: opts.deepLink },
        style: 'primary',
        height: 'sm',
        color: '#E11D48',
        cornerRadius: 'md',
      }],
    },
  };
}

/** Flex Bubble สำหรับ Status Change alert */
function statusFlexBubble(opts: {
  solutionTitle: string;
  changerName: string;
  fromStatus: string;
  toStatus: string;
  deepLink: string;
}) {
  const STATUS_EMOJI: Record<string, string> = {
    lead: '🔵',
    proposal: '🟣',
    in_progress: '🟡',
    on_hold: '🟠',
    completed: '🟢',
    cancelled: '🔴',
  };
  
  const fromKey = opts.fromStatus.toLowerCase().replace(' ', '_');
  const toKey = opts.toStatus.toLowerCase().replace(' ', '_');
  const toEmoji = STATUS_EMOJI[toKey] ?? '⚪';

  // Determine badge colors for visual quality
  let badgeBg = '#F1F5F9';
  let badgeTextColor = '#475569';

  if (toKey === 'completed') {
    badgeBg = '#D1FAE5';
    badgeTextColor = '#065F46';
  } else if (toKey === 'cancelled') {
    badgeBg = '#FEE2E2';
    badgeTextColor = '#991B1B';
  } else if (toKey === 'on_hold') {
    badgeBg = '#FEF3C7';
    badgeTextColor = '#92400E';
  } else if (toKey === 'in_progress') {
    badgeBg = '#FEF9C3';
    badgeTextColor = '#854D0E';
  } else if (toKey === 'proposal') {
    badgeBg = '#F3E8FF';
    badgeTextColor = '#6B21A8';
  } else if (toKey === 'lead') {
    badgeBg = '#DBEAFE';
    badgeTextColor = '#1D4ED8';
  }

  return {
    type: 'bubble',
    size: 'kilo',
    header: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '12px',
      background: {
        type: 'linearGradient',
        angle: '135deg',
        startColor: '#2563EB',
        endColor: '#3B82F6',
      },
      contents: [{
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        alignItems: 'center',
        contents: [
          { type: 'text', text: '📋', size: 'sm', flex: 0 },
          { type: 'text', text: 'อัปเดตสถานะ', color: '#FFFFFF', weight: 'bold', size: 'sm' },
        ],
      }],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      paddingAll: '16px',
      contents: [
        { type: 'text', text: opts.solutionTitle, weight: 'bold', size: 'md', wrap: true, color: '#0F172A' },
        {
          type: 'box',
          layout: 'horizontal',
          spacing: 'md',
          alignItems: 'center',
          backgroundColor: '#F8FAFC',
          paddingAll: '10px',
          cornerRadius: 'md',
          borderWidth: '1px',
          borderColor: '#E2E8F0',
          contents: [
            {
              type: 'box',
              layout: 'vertical',
              backgroundColor: '#E2E8F0',
              cornerRadius: 'sm',
              paddingAll: '4px',
              paddingStart: '8px',
              paddingEnd: '8px',
              contents: [
                { type: 'text', text: opts.fromStatus, size: 'xs', color: '#475569', weight: 'bold', align: 'center' },
              ],
            },
            {
              type: 'text',
              text: '➡️',
              size: 'xs',
              color: '#94A3B8',
              flex: 0,
            },
            {
              type: 'box',
              layout: 'vertical',
              backgroundColor: badgeBg,
              cornerRadius: 'sm',
              paddingAll: '4px',
              paddingStart: '8px',
              paddingEnd: '8px',
              contents: [
                {
                  type: 'text',
                  text: `${toEmoji} ${opts.toStatus}`,
                  size: 'xs',
                  color: badgeTextColor,
                  weight: 'bold',
                  align: 'center',
                },
              ],
            },
          ],
        },
        {
          type: 'box',
          layout: 'horizontal',
          spacing: 'xs',
          alignItems: 'center',
          contents: [
            { type: 'text', text: '👤', size: 'xs', flex: 0 },
            { type: 'text', text: `ปรับปรุงโดย: ${opts.changerName}`, size: 'xs', color: '#64748B', weight: 'bold' },
          ],
        },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '12px',
      contents: [{
        type: 'button',
        action: { type: 'uri', label: 'เปิด Solution', uri: opts.deepLink },
        style: 'primary',
        height: 'sm',
        color: '#2563EB',
        cornerRadius: 'md',
      }],
    },
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * แจ้งเตือน issue note ใหม่ → assignee + manager/owner ของ org
 */
export async function notifyIssueNote(opts: {
  admin: Admin;
  orgId: string;
  solutionId: string;
  solutionTitle: string;
  solutionAssignedTo: string | null;
  authorId: string;
  authorName: string;
  content: string;
}): Promise<void> {
  try {
    const { admin, orgId, solutionId, solutionTitle, solutionAssignedTo, authorId, authorName, content } = opts;

    const [lineUserIds, orgSlug] = await Promise.all([
      getCrmRecipients(admin, orgId, solutionAssignedTo, authorId, true),
      getOrgSlug(admin, orgId),
    ]);

    if (lineUserIds.length === 0) return;

    const deepLink = `https://perpos.io/${orgSlug}/crm/solutions/${solutionId}`;

    await sendLineMessages({
      to: lineUserIds,
      messages: [{
        type: 'flex',
        altText: `🚨 Issue ใหม่ใน "${solutionTitle}"`,
        contents: issueFlexBubble({
          solutionTitle,
          authorName,
          contentPreview: preview(content),
          deepLink,
        }),
      }],
    });
  } catch (e) {
    console.error('[crm:notify] notifyIssueNote error:', e);
  }
}

/**
 * แจ้งเตือนเมื่อ solution เปลี่ยน status → assignee ของ solution
 */
export async function notifyStatusChange(opts: {
  admin: Admin;
  orgId: string;
  solutionId: string;
  solutionTitle: string;
  solutionAssignedTo: string | null;
  changerId: string;
  changerName: string;
  fromStatus: string;
  toStatus: string;
}): Promise<void> {
  try {
    const { admin, orgId, solutionId, solutionTitle, solutionAssignedTo, changerId, changerName, fromStatus, toStatus } = opts;

    const [lineUserIds, orgSlug] = await Promise.all([
      getCrmRecipients(admin, orgId, solutionAssignedTo, changerId, false),
      getOrgSlug(admin, orgId),
    ]);

    if (lineUserIds.length === 0) return;

    const STATUS_LABEL: Record<string, string> = {
      lead: 'Lead', proposal: 'Proposal', in_progress: 'In Progress',
      on_hold: 'On Hold', completed: 'Completed', cancelled: 'Cancelled',
    };

    const deepLink = `https://perpos.io/${orgSlug}/crm/solutions/${solutionId}`;

    await sendLineMessages({
      to: lineUserIds,
      messages: [{
        type: 'flex',
        altText: `📋 "${solutionTitle}" เปลี่ยนเป็น ${STATUS_LABEL[toStatus] ?? toStatus}`,
        contents: statusFlexBubble({
          solutionTitle,
          changerName,
          fromStatus: STATUS_LABEL[fromStatus] ?? fromStatus,
          toStatus:   STATUS_LABEL[toStatus]   ?? toStatus,
          deepLink,
        }),
      }],
    });
  } catch (e) {
    console.error('[crm:notify] notifyStatusChange error:', e);
  }
}
