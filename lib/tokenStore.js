const paid = new Set();
const used = new Set();

export const markSessionPaid = (id) => paid.add(id);
export const isSessionPaid = (id) => paid.has(id);
export const markSessionUsed = (id) => used.add(id);
export const isSessionUsed = (id) => used.has(id);
