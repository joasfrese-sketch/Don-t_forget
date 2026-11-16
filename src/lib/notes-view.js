// Reine Gruppierung der Notizen für die Liste.
const t = (s) => new Date(s).getTime();

export function groupNotes(notes, now) {
  const due = [], upcoming = [], done = [];
  for (const n of notes) {
    if (n.status === 'done') done.push(n);
    else if (t(n.remind_at) <= now.getTime()) due.push(n);
    else upcoming.push(n);
  }
  const byRemind = (a, b) => t(a.remind_at) - t(b.remind_at);
  due.sort(byRemind);
  upcoming.sort(byRemind);
  done.sort((a, b) => t(b.updated_at) - t(a.updated_at));
  return { due, upcoming, done };
}
