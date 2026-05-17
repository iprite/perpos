import { Injectable } from '@nestjs/common';

export interface CalendarEventResult {
  id: string;
  htmlLink?: string;
}

@Injectable()
export class CalendarService {
  async createEvent(args: {
    accessToken: string;
    title: string;
    startsAt: string;
    durationMinutes?: number;
    timeZone?: string;
  }): Promise<CalendarEventResult | null> {
    const { accessToken, title, startsAt, durationMinutes = 60, timeZone = 'Asia/Bangkok' } = args;
    const start = new Date(startsAt);
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: title,
        start: { dateTime: start.toISOString(), timeZone },
        end: { dateTime: end.toISOString(), timeZone },
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => null) as Record<string, unknown> | null;
      const msg = (errData?.error as Record<string, string>)?.message || res.statusText || `http_${res.status}`;
      throw new Error(String(msg));
    }

    const data = await res.json().catch(() => null) as Record<string, unknown> | null;
    if (!data?.id) return null;
    return { id: String(data.id), htmlLink: data.htmlLink as string | undefined };
  }

  async deleteEvent(args: { accessToken: string; eventId: string }): Promise<void> {
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(args.eventId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${args.accessToken}` },
    }).catch(() => null);
  }
}
