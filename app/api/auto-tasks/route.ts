import { NextRequest, NextResponse } from "next/server";
import { extractRecentTasks } from "@/lib/task-extractor";
import fs from "fs";
import path from "path";

const PROJECTS_PATH = path.join(process.cwd(), "data/projects.json");

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

// GET: preview extracted tasks
export async function GET(request: NextRequest) {
  const days = parseInt(request.nextUrl.searchParams.get("days") || "1", 10);
  const tasks = extractRecentTasks(days);
  return NextResponse.json({ tasks, count: tasks.length });
}

// POST: sync extracted tasks into a project
export async function POST(request: NextRequest) {
  try {
    const { projectId, days } = await request.json();
    const data = readProjects();
    const project = data.projects.find((p: any) => p.id === projectId);
    if (!project) {
      return NextResponse.json({ error: "project not found" }, { status: 404 });
    }

    const tasks = extractRecentTasks(days || 1);
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

      // Check duplicate (by similar text)
      const isDuplicate = member.tasks.some(
        (t: any) => t.text === task.text || t.text.includes(task.text) || task.text.includes(t.text)
      );

      if (!isDuplicate) {
        member.tasks.push({
          text: task.text,
          done: false,
          autoDetected: true,
          detectedAt: task.timestamp,
        });
        added++;
      }
    }

    writeProjects(data);
    return NextResponse.json({ added, total: tasks.length, projects: data.projects });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
