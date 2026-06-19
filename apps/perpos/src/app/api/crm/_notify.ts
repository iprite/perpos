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
        startColor: '#D57DAF',
        endColor: '#F1A7D1',
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
        { type: 'text', text: opts.solutionTitle, weight: 'bold', size: 'md', wrap: true, color: '#1A1A1B' },
        {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#F8FAFC',
          cornerRadius: 'md',
          paddingAll: '10px',
          borderWidth: '1px',
          borderColor: '#E6E9EE',
          contents: [
            { type: 'text', text: opts.contentPreview, size: 'sm', color: '#525866', wrap: true, maxLines: 4, style: 'italic' },
          ],
        },
        {
          type: 'box',
          layout: 'horizontal',
          spacing: 'xs',
          alignItems: 'center',
          contents: [
            { type: 'text', text: '👤', size: 'xs', flex: 0 },
            { type: 'text', text: `รายงานโดย: ${opts.authorName}`, size: 'xs', color: '#656D78', weight: 'bold' },
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
        color: '#D57DAF',
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
  let badgeBg = '#F5F7FA';
  let badgeTextColor = '#525866';

  if (toKey === 'completed') {
    badgeBg = '#E4F8F3';
    badgeTextColor = '#428B79';
  } else if (toKey === 'cancelled') {
    badgeBg = '#F9E0E4';
    badgeTextColor = '#903744';
  } else if (toKey === 'on_hold') {
    badgeBg = '#FFF8E5';
    badgeTextColor = '#A58A49';
  } else if (toKey === 'in_progress') {
    badgeBg = '#FFF8E5';
    badgeTextColor = '#A58A49';
  } else if (toKey === 'proposal') {
    badgeBg = '#ECE8F4';
    badgeTextColor = '#61537F';
  } else if (toKey === 'lead') {
    badgeBg = '#E5F6FC';
    badgeTextColor = '#4999B5';
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
        startColor: '#4DB0D3',
        endColor: '#4FC1E9',
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
        { type: 'text', text: opts.solutionTitle, weight: 'bold', size: 'md', wrap: true, color: '#1A1A1B' },
        {
          type: 'box',
          layout: 'horizontal',
          spacing: 'md',
          alignItems: 'center',
          backgroundColor: '#F8FAFC',
          paddingAll: '10px',
          cornerRadius: 'md',
          borderWidth: '1px',
          borderColor: '#E6E9EE',
          contents: [
            {
              type: 'box',
              layout: 'vertical',
              backgroundColor: '#E6E9EE',
              cornerRadius: 'sm',
              paddingAll: '4px',
              paddingStart: '8px',
              paddingEnd: '8px',
              contents: [
                { type: 'text', text: opts.fromStatus, size: 'xs', color: '#525866', weight: 'bold', align: 'center' },
              ],
            },
            {
              type: 'text',
              text: '➡️',
              size: 'xs',
              color: '#9CA3AF',
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
            { type: 'text', text: `ปรับปรุงโดย: ${opts.changerName}`, size: 'xs', color: '#656D78', weight: 'bold' },
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
        color: '#4DB0D3',
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

    const deepLink = `https://perpos.ai/${orgSlug}/crm/solutions/${solutionId}`;

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

    const deepLink = `https://perpos.ai/${orgSlug}/crm/solutions/${solutionId}`;

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
