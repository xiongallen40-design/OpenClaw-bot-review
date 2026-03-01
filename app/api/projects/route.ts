import { NextRequest, NextResponse } from "next/server";
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
  fs.mkdirSync(path.dirname(PROJECTS_PATH), { recursive: true });
  fs.writeFileSync(PROJECTS_PATH, JSON.stringify(data, null, 2));
}

export async function GET() {
  return NextResponse.json(readProjects());
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;
    const data = readProjects();

    switch (action) {
      case "add-project": {
        const { name, emoji, owner } = body;
        const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        data.projects.push({
          id,
          name,
          emoji: emoji || "📋",
          owner: owner || "",
          status: "in-progress",
          tasks: [],
        });
        break;
      }

      case "add-task": {
        const { projectId, text } = body;
        const project = data.projects.find((p: any) => p.id === projectId);
        if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });
        project.tasks.push({ text, done: false });
        break;
      }

      case "toggle-task": {
        const { projectId: pid, taskIndex } = body;
        const proj = data.projects.find((p: any) => p.id === pid);
        if (!proj || !proj.tasks[taskIndex]) return NextResponse.json({ error: "not found" }, { status: 404 });
        proj.tasks[taskIndex].done = !proj.tasks[taskIndex].done;
        break;
      }

      case "delete-task": {
        const { projectId: dpid, taskIndex: dti } = body;
        const dproj = data.projects.find((p: any) => p.id === dpid);
        if (!dproj) return NextResponse.json({ error: "not found" }, { status: 404 });
        dproj.tasks.splice(dti, 1);
        break;
      }

      case "delete-project": {
        const { projectId: delId } = body;
        data.projects = data.projects.filter((p: any) => p.id !== delId);
        break;
      }

      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }

    writeProjects(data);
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
