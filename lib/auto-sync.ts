/**
 * Auto-sync: periodically scan conversations for new tasks
 * and inject them into the project board.
 */

import { extractRecentTasks } from "./task-extractor";
import fs from "fs";
import path from "path";

const PROJECTS_PATH = path.join(process.cwd(), "data/projects.json");

function readProjects() {
  try {
    return JSON.parse(fs.readFileSync(PROJECTS_PATH, "utf-8"));
  } catch {
    return { projects: [], states: {}, transitions: {} };
  }
}

function writeProjects(data: any) {
  fs.writeFileSync(PROJECTS_PATH, JSON.stringify(data, null, 2));
}

let _interval: NodeJS.Timeout | null = null;
let _lastSyncCount = 0;

export function getLastSyncCount() {
  return _lastSyncCount;
}

function syncOnce(): number {
  const data = readProjects();
  if (!data.projects || data.projects.length === 0) return 0;

  // Sync to first active project
  const project = data.projects[0];
  const tasks = extractRecentTasks(1); // last 24h
  let added = 0;

  for (const task of tasks) {
    // Find or create member
    let member = project.members.find(
      (m: any) => m.name.toLowerCase() === task.agentName.toLowerCase()
    );
    if (!member) {
      member = { name: task.agentName, emoji: "🤖", tasks: [] };
      project.members.push(member);
    }

    // Dedup
    const isDuplicate = member.tasks.some(
      (t: any) =>
        t.text === task.text ||
        (t.text.length > 10 && task.text.length > 10 &&
          (t.text.includes(task.text.slice(0, 20)) || task.text.includes(t.text.slice(0, 20))))
    );

    if (!isDuplicate) {
      member.tasks.push({
        text: task.text,
        state: "todo",
        autoDetected: true,
        detectedAt: task.timestamp,
      });
      added++;
    }
  }

  if (added > 0) {
    writeProjects(data);
  }

  _lastSyncCount = added;
  return added;
}

export function startAutoSync(intervalMs: number = 60000) {
  if (_interval) return;

  // Initial sync after 5s
  setTimeout(() => {
    try { syncOnce(); } catch {}
  }, 5000);

  _interval = setInterval(() => {
    try { syncOnce(); } catch {}
  }, intervalMs);

  console.log(`[auto-sync] started, interval=${intervalMs}ms`);
}

export function stopAutoSync() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
}
