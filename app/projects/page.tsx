"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useI18n } from "@/lib/i18n";

interface Task {
  text: string;
  done: boolean;
  completedAt?: number;
}

interface Project {
  id: string;
  name: string;
  emoji: string;
  owner: string;
  status: string;
  tasks: Task[];
}

export default function ProjectsPage() {
  const { t } = useI18n();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTaskText, setNewTaskText] = useState<Record<string, string>>({});
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProject, setNewProject] = useState({ name: "", emoji: "📋", owner: "" });
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => {
        setProjects(d.projects || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
    // Poll every 5s for real-time sync across devices
    pollRef.current = setInterval(fetchData, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchData]);

  const doAction = async (body: any) => {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.projects) setProjects(data.projects);
  };

  const toggleTask = (projectId: string, taskIndex: number) => {
    doAction({ action: "toggle-task", projectId, taskIndex });
  };

  const addTask = (projectId: string) => {
    const text = newTaskText[projectId]?.trim();
    if (!text) return;
    doAction({ action: "add-task", projectId, text });
    setNewTaskText((prev) => ({ ...prev, [projectId]: "" }));
  };

  const deleteTask = (projectId: string, taskIndex: number) => {
    doAction({ action: "delete-task", projectId, taskIndex });
  };

  const addProject = () => {
    if (!newProject.name.trim()) return;
    doAction({ action: "add-project", ...newProject });
    setNewProject({ name: "", emoji: "📋", owner: "" });
    setShowNewProject(false);
  };

  const deleteProject = (projectId: string) => {
    if (confirm("确定删除这个项目？")) {
      doAction({ action: "delete-project", projectId });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[var(--text-muted)]">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">📋 {t("projects.title")}</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">{t("projects.subtitle")}</p>
        </div>
        <button
          onClick={() => setShowNewProject(!showNewProject)}
          className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          + {t("projects.new")}
        </button>
      </div>

      {/* New project form */}
      {showNewProject && (
        <div className="rounded-xl border border-[var(--accent)]/30 bg-[var(--card)] p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <input
              type="text"
              placeholder={t("projects.name")}
              value={newProject.name}
              onChange={(e) => setNewProject((p) => ({ ...p, name: e.target.value }))}
              className="col-span-2 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm"
              onKeyDown={(e) => e.key === "Enter" && addProject()}
            />
            <input
              type="text"
              placeholder={t("projects.owner")}
              value={newProject.owner}
              onChange={(e) => setNewProject((p) => ({ ...p, owner: e.target.value }))}
              className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={addProject} className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-sm">
              {t("projects.create")}
            </button>
            <button onClick={() => setShowNewProject(false)} className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)] text-sm">
              {t("projects.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* Project cards */}
      {projects.length === 0 ? (
        <div className="text-center py-16 text-[var(--text-muted)]">{t("projects.empty")}</div>
      ) : (
        <div className="space-y-4">
          {projects.map((project) => {
            const pendingTasks = project.tasks
              .map((t, i) => ({ ...t, originalIndex: i }))
              .filter((t) => !t.done);
            const doneTasks = project.tasks
              .map((t, i) => ({ ...t, originalIndex: i }))
              .filter((t) => t.done);
            const doneCount = doneTasks.length;
            const totalCount = project.tasks.length;
            const progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

            return (
              <div
                key={project.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden"
              >
                {/* Project header */}
                <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{project.emoji}</span>
                    <div>
                      <div className="font-semibold text-[var(--text)]">{project.name}</div>
                      <div className="text-xs text-[var(--text-muted)]">
                        {project.owner && `👤 ${project.owner} · `}
                        {doneCount}/{totalCount} {t("projects.completed")}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-32 h-2 rounded-full bg-[var(--border)] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${progress}%`,
                          backgroundColor: progress === 100 ? "#22c55e" : "var(--accent)",
                        }}
                      />
                    </div>
                    <span className="text-xs font-mono text-[var(--text-muted)]">{progress}%</span>
                    <button
                      onClick={() => deleteProject(project.id)}
                      className="text-[var(--text-muted)] hover:text-red-500 transition-colors text-sm"
                      title="删除项目"
                    >
                      🗑
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[var(--border)]">
                  {/* In Progress column */}
                  <div className="px-5 py-3">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                        {t("projects.inProgress")} ({pendingTasks.length})
                      </span>
                    </div>
                    <div className="space-y-1 min-h-[40px]">
                      {pendingTasks.map((task) => (
                        <div
                          key={task.originalIndex}
                          className="flex items-center gap-3 py-1.5 group animate-fadeIn"
                        >
                          <button
                            onClick={() => toggleTask(project.id, task.originalIndex)}
                            className="w-5 h-5 rounded border-2 border-[var(--border)] hover:border-[var(--accent)] flex items-center justify-center transition-colors flex-shrink-0"
                          />
                          <span className="flex-1 text-sm text-[var(--text)]">{task.text}</span>
                          <button
                            onClick={() => deleteTask(project.id, task.originalIndex)}
                            className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-500 transition-all text-xs"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                    {/* Add task */}
                    <div className="flex items-center gap-2 pt-2 mt-2 border-t border-[var(--border)]/50">
                      <input
                        type="text"
                        placeholder={`+ ${t("projects.addTask")}`}
                        value={newTaskText[project.id] || ""}
                        onChange={(e) =>
                          setNewTaskText((prev) => ({ ...prev, [project.id]: e.target.value }))
                        }
                        onKeyDown={(e) => e.key === "Enter" && addTask(project.id)}
                        className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm placeholder:text-[var(--text-muted)]/50"
                      />
                    </div>
                  </div>

                  {/* Finished column */}
                  <div className="px-5 py-3">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                        {t("projects.finished")} ({doneTasks.length})
                      </span>
                    </div>
                    <div className="space-y-1 min-h-[40px]">
                      {doneTasks.length === 0 ? (
                        <div className="text-xs text-[var(--text-muted)]/50 py-2">{t("projects.noFinished")}</div>
                      ) : (
                        doneTasks.map((task) => (
                          <div
                            key={task.originalIndex}
                            className="flex items-center gap-3 py-1.5 group animate-fadeIn"
                          >
                            <button
                              onClick={() => toggleTask(project.id, task.originalIndex)}
                              className="w-5 h-5 rounded border-2 bg-green-500 border-green-500 text-white flex items-center justify-center transition-colors flex-shrink-0 text-xs"
                            >
                              ✓
                            </button>
                            <span className="flex-1 text-sm line-through text-[var(--text-muted)]">
                              {task.text}
                            </span>
                            <button
                              onClick={() => deleteTask(project.id, task.originalIndex)}
                              className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-500 transition-all text-xs"
                            >
                              ✕
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}
