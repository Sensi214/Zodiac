const sessionStatus = new Map();

export function markSessionPaid(sessionId) {
  sessionStatus.set(sessionId, {
    paid: true,
    used: false,
    paidAt: Date.now()
  });
}

export function isSessionPaid(sessionId) {
  return sessionStatus.has(sessionId) && sessionStatus.get(sessionId).paid === true;
}

export function isSessionUsed(sessionId) {
  return sessionStatus.has(sessionId) && sessionStatus.get(sessionId).used === true;
}

export function markSessionUsed(sessionId) {
  if (!sessionStatus.has(sessionId)) return;
  const current = sessionStatus.get(sessionId);
  sessionStatus.set(sessionId, { ...current, used: true });
}
