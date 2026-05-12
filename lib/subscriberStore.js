import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../data");
const SUBSCRIBERS_FILE = path.join(DATA_DIR, "subscribers.json");

// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error("Failed to create data directory:", err);
  }
}

// Ensure subscribers.json exists
async function ensureSubscribersFile() {
  await ensureDataDir();
  try {
    await fs.access(SUBSCRIBERS_FILE);
  } catch {
    // File doesn't exist, create it
    await fs.writeFile(SUBSCRIBERS_FILE, JSON.stringify({ subscribers: {} }, null, 2));
  }
}

// Read subscribers data
async function readSubscribers() {
  await ensureSubscribersFile();
  try {
    const data = await fs.readFile(SUBSCRIBERS_FILE, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Failed to read subscribers file:", err);
    return { subscribers: {} };
  }
}

// Write subscribers data
async function writeSubscribers(data) {
  await ensureDataDir();
  try {
    await fs.writeFile(SUBSCRIBERS_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Failed to write subscribers file:", err);
  }
}

// Normalize email: lowercase and trim
export function normalizeEmail(email) {
  return email.toLowerCase().trim();
}

// Get current month key in YYYY-MM format
export function getCurrentMonthKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

// Ensure subscriber exists in store
export async function ensureSubscriber(email) {
  const normalized = normalizeEmail(email);
  const data = await readSubscribers();

  if (!data.subscribers[normalized]) {
    data.subscribers[normalized] = {
      email: normalized,
      createdAt: new Date().toISOString(),
      lastFreeReadingMonth: null,
      freeReadingCount: 0
    };
    await writeSubscribers(data);
  }

  return data.subscribers[normalized];
}

// Check if subscriber can use monthly free reading
export async function canUseMonthlyFreeReading(email) {
  const normalized = normalizeEmail(email);
  const data = await readSubscribers();
  const subscriber = data.subscribers[normalized];

  if (!subscriber) {
    return true; // New subscriber can use free reading
  }

  const currentMonth = getCurrentMonthKey();
  const lastMonth = subscriber.lastFreeReadingMonth;

  // If last reading was in a different month, reset count
  if (lastMonth !== currentMonth) {
    return true;
  }

  // If last reading was this month and count >= 1, deny
  return subscriber.freeReadingCount < 1;
}

// Mark monthly free reading as used
export async function markMonthlyFreeReadingUsed(email) {
  const normalized = normalizeEmail(email);
  const data = await readSubscribers();
  const currentMonth = getCurrentMonthKey();

  if (!data.subscribers[normalized]) {
    data.subscribers[normalized] = {
      email: normalized,
      createdAt: new Date().toISOString(),
      lastFreeReadingMonth: currentMonth,
      freeReadingCount: 1
    };
  } else {
    const subscriber = data.subscribers[normalized];
    const lastMonth = subscriber.lastFreeReadingMonth;

    // If reading was last month, reset count
    if (lastMonth !== currentMonth) {
      subscriber.freeReadingCount = 0;
    }

    subscriber.lastFreeReadingMonth = currentMonth;
    subscriber.freeReadingCount += 1;
  }

  await writeSubscribers(data);
}
