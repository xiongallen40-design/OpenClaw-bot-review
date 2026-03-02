import { NextRequest, NextResponse } from "next/server";
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
        const { name, emoji } = body;
        const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        data.projects.push({
          id,
          name,
          emoji: emoji || "📋",
          status: "in-progress",
          members: [],
        });
        break;
      }

      case "delete-project": {
        const { projectId } = body;
        data.projects = data.projects.filter((p: any) => p.id !== projectId);
        break;
      }

      case "add-member": {
        const { projectId, memberName, memberEmoji } = body;
        const project = data.projects.find((p: any) => p.id === projectId);
        if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });
        if (project.members.some((m: any) => m.name === memberName)) {
          return NextResponse.json({ error: "member exists" }, { status: 400 });
        }
        project.members.push({ name: memberName, emoji: memberEmoji || "🤖", tasks: [] });
        break;
      }

      case "add-task": {
        const { projectId, memberName, text } = body;
        const proj = data.projects.find((p: any) => p.id === projectId);
        if (!proj) return NextResponse.json({ error: "project not found" }, { status: 404 });
        const member = proj.members.find((m: any) => m.name === memberName);
        if (!member) return NextResponse.json({ error: "member not found" }, { status: 404 });
        member.tasks.push({ text, state: "todo" });
        break;
      }

      case "transition-task": {
        const { projectId: pid, memberName: mn, taskIndex, newState } = body;
        const p = data.projects.find((p: any) => p.id === pid);
        if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
        const m = p.members.find((m: any) => m.name === mn);
        if (!m || !m.tasks[taskIndex]) return NextResponse.json({ error: "not found" }, { status: 404 });

        const task = m.tasks[taskIndex];
        const currentState = task.state || "todo";
        const transitions = data.transitions || {};
        const allowed = transitions[currentState] || [];

        if (!allowed.includes(newState) && newState !== currentState) {
          return NextResponse.json({
            error: `不允许从 "${currentState}" 流转到 "${newState}"`,
            allowed,
          }, { status: 400 });
        }

        task.state = newState;
        if (newState === "review") {
          task.reviewRequestedAt = new Date().toISOString();
        }
        if (newState === "done") {
          task.completedAt = new Date().toISOString();
        }
        if (newState === "rejected") {
          task.rejectedAt = new Date().toISOString();
          task.rejectionReason = body.reason || "";
        }
        break;
      }

      // Legacy toggle support (maps to state transitions)
      case "toggle-task": {
        const { projectId: tpid, memberName: tmn, taskIndex: tti } = body;
        const tp = data.projects.find((p: any) => p.id === tpid);
        if (!tp) return NextResponse.json({ error: "not found" }, { status: 404 });
        const tm = tp.members.find((m: any) => m.name === tmn);
        if (!tm || !tm.tasks[tti]) return NextResponse.json({ error: "not found" }, { status: 404 });
        const task = tm.tasks[tti];
        // Simple toggle: done ↔ todo
        if (task.state === "done") {
          task.state = "todo";
        } else if (task.done !== undefined) {
          // Migration: old format
          task.state = task.done ? "todo" : "done";
          delete task.done;
        } else {
          task.state = "done";
        }
        break;
      }

      case "delete-task": {
        const { projectId: dpid, memberName: dmn, taskIndex: dti } = body;
        const dp = data.projects.find((p: any) => p.id === dpid);
        if (!dp) return NextResponse.json({ error: "not found" }, { status: 404 });
        const dm = dp.members.find((m: any) => m.name === dmn);
        if (!dm) return NextResponse.json({ error: "not found" }, { status: 404 });
        dm.tasks.splice(dti, 1);
        break;
      }

      case "submit-review": {
        // Vesemir submits review result
        const { projectId: rpid, memberName: rmn, taskIndex: rti, verdict, reason } = body;
        const rp = data.projects.find((p: any) => p.id === rpid);
        if (!rp) return NextResponse.json({ error: "not found" }, { status: 404 });
        const rm = rp.members.find((m: any) => m.name === rmn);
        if (!rm || !rm.tasks[rti]) return NextResponse.json({ error: "not found" }, { status: 404 });
        const task = rm.tasks[rti];

        if (task.state !== "review") {
          return NextResponse.json({ error: "任务不在审核状态" }, { status: 400 });
        }

        if (verdict === "approved") {
          task.state = "doing";
          task.reviewResult = { verdict: "approved", reason, reviewedAt: new Date().toISOString() };
        } else if (verdict === "rejected") {
          task.state = "rejected";
          task.reviewResult = { verdict: "rejected", reason, reviewedAt: new Date().toISOString() };
          task.rejectedAt = new Date().toISOString();
          task.rejectionReason = reason || "";
        }
        break;
      }

      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }

    writeProjects(data);
    return NextResponse.json({ ...data, ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
