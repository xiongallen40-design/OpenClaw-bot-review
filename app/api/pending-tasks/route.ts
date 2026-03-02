import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { extractRecentTasks } from "@/lib/task-extractor";
import { summarizeTasks } from "@/lib/task-summarizer";

const PENDING_PATH = path.join(process.cwd(), "data/pending-tasks.json");
const PROJECTS_PATH = path.join(process.cwd(), "data/projects.json");

function readPending() {
  try {
    return JSON.parse(fs.readFileSync(PENDING_PATH, "utf-8"));
  } catch {
    return { tasks: [], lastSyncAt: null };
  }
}

function writePending(data: any) {
  fs.mkdirSync(path.dirname(PENDING_PATH), { recursive: true });
  fs.writeFileSync(PENDING_PATH, JSON.stringify(data, null, 2));
}

function readProjects() {
  try {
    return JSON.parse(fs.readFileSync(PROJECTS_PATH, "utf-8"));
  } catch {
    return { projects: [] };
  }
}

function writeProjects(data: any) {
  fs.writeFileSync(PROJECTS_PATH, JSON.stringify(data, null, 2));
}

// GET: list pending tasks
export async function GET() {
  return NextResponse.json(readPending());
}

// POST: actions on pending tasks
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      // Scan conversations + LLM summarize → pending queue
      case "scan": {
        const days = body.days || 3;
        const rawTasks = extractRecentTasks(days);

        if (rawTasks.length === 0) {
          return NextResponse.json({ message: "没有检测到新任务", tasks: [] });
        }

        // LLM summarization
        const summarized = await summarizeTasks(rawTasks);

        // Check duplicates against existing pending + project tasks
        const pending = readPending();
        const projects = readProjects();
        const existingTexts = new Set<string>();

        // Collect existing task titles
        for (const t of pending.tasks) existingTexts.add(t.title.toLowerCase());
        for (const p of projects.projects || []) {
          for (const m of p.members || []) {
            for (const t of m.tasks || []) {
              existingTexts.add((t.text || "").toLowerCase());
            }
          }
        }

        const newTasks = summarized.filter(
          (t) => !existingTexts.has(t.title.toLowerCase())
        );

        for (const t of newTasks) {
          pending.tasks.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            ...t,
            status: "pending", // pending | approved | rejected
            createdAt: new Date().toISOString(),
          });
        }

        pending.lastSyncAt = new Date().toISOString();
        writePending(pending);

        return NextResponse.json({
          message: `检测到 ${rawTasks.length} 条原始消息，归纳为 ${newTasks.length} 条新任务`,
          rawCount: rawTasks.length,
          newCount: newTasks.length,
          tasks: pending.tasks.filter((t: any) => t.status === "pending"),
        });
      }

      // Approve: move to project board
      case "approve": {
        const { taskId, projectId } = body;
        const pending = readPending();
        const task = pending.tasks.find((t: any) => t.id === taskId);
        if (!task) return NextResponse.json({ error: "not found" }, { status: 404 });

        // Add to project
        const projects = readProjects();
        const project = projects.projects.find((p: any) => p.id === (projectId || projects.projects[0]?.id));
        if (!project) return NextResponse.json({ error: "no project" }, { status: 404 });

        let member = project.members.find(
          (m: any) => m.name.toLowerCase() === task.agentName.toLowerCase()
        );
        if (!member) {
          member = { name: task.agentName, emoji: "🤖", tasks: [] };
          project.members.push(member);
        }

        member.tasks.push({
          text: task.title,
          state: "todo",
          description: task.description,
          priority: task.priority,
        });

        task.status = "approved";
        writePending(pending);
        writeProjects(projects);

        return NextResponse.json({ ok: true, projects: projects.projects });
      }

      // Approve all pending
      case "approve-all": {
        const { projectId: pid } = body;
        const pending = readPending();
        const projects = readProjects();
        const project = projects.projects.find((p: any) => p.id === (pid || projects.projects[0]?.id));
        if (!project) return NextResponse.json({ error: "no project" }, { status: 404 });

        let count = 0;
        for (const task of pending.tasks) {
          if (task.status !== "pending") continue;

          let member = project.members.find(
            (m: any) => m.name.toLowerCase() === task.agentName.toLowerCase()
          );
          if (!member) {
            member = { name: task.agentName, emoji: "🤖", tasks: [] };
            project.members.push(member);
          }

          member.tasks.push({
            text: task.title,
            state: "todo",
            description: task.description,
            priority: task.priority,
          });

          task.status = "approved";
          count++;
        }

        writePending(pending);
        writeProjects(projects);
        return NextResponse.json({ ok: true, approved: count, projects: projects.projects });
      }

      // Reject: remove from queue
      case "reject": {
        const { taskId: rid } = body;
        const pending = readPending();
        const task = pending.tasks.find((t: any) => t.id === rid);
        if (task) task.status = "rejected";
        writePending(pending);
        return NextResponse.json({ ok: true });
      }

      // Clear all rejected/approved
      case "clear": {
        const pending = readPending();
        pending.tasks = pending.tasks.filter((t: any) => t.status === "pending");
        writePending(pending);
        return NextResponse.json({ ok: true });
      }

      // Edit task title before approving
      case "edit": {
        const { taskId: eid, title, agentName } = body;
        const pending = readPending();
        const task = pending.tasks.find((t: any) => t.id === eid);
        if (!task) return NextResponse.json({ error: "not found" }, { status: 404 });
        if (title) task.title = title;
        if (agentName) task.agentName = agentName;
        writePending(pending);
        return NextResponse.json({ ok: true, task });
      }

      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
