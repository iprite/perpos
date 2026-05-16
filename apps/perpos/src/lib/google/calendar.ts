const CALENDAR_API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export type CalendarEventResult = {
  id: string;
  htmlLink?: string;
};

/**
 * Create a Google Calendar event using an existing access token.
 * Returns the event ID on success, null if the token lacks Calendar scope.
 */
export async function createCalendarEvent(args: {
  accessToken: string;
  title: string;
  startsAt: string;   // ISO string
  durationMinutes?: number;
  timeZone?: string;
}): Promise<CalendarEventResult | null> {
  const { accessToken, title, startsAt, durationMinutes = 60, timeZone = "Asia/Bangkok" } = args;

  const start = new Date(startsAt);
  const end   = new Date(start.getTime() + durationMinutes * 60 * 1000);

  const body = JSON.stringify({
    summary: title,
    start: { dateTime: start.toISOString(), timeZone },
    end:   { dateTime: end.toISOString(),   timeZone },
  });

  const res = await fetch(CALENDAR_API, {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body,
  });

  if (!res.ok) return null;

  const data = await res.json().catch(() => null);
  if (!data?.id) return null;
  return { id: String(data.id), htmlLink: data.htmlLink };
}

/**
 * Delete a Google Calendar event by ID. Fails silently.
 */
export async function deleteCalendarEvent(args: {
  accessToken: string;
  eventId: string;
}): Promise<void> {
  await fetch(`${CALENDAR_API}/${encodeURIComponent(args.eventId)}`, {
    method:  "DELETE",
    headers: { Authorization: `Bearer ${args.accessToken}` },
  }).catch(() => null);
}
