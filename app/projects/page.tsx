"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useI18n } from "@/lib/i18n";

interface Task {
  text: string;
  done: boolean;
}

interface Member {
  name: string;
  emoji: string;
  tasks: Task[];
}

interface Project {
  id: string;
  name: string;
  emoji: string;
  status: string;
  members: Member[];
}

export default function ProjectsPage() {
  const { t } = useI18n();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTaskText, setNewTaskText] = useState<Record<string, string>>({});
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProject, setNewProject] = useState({ name: "", emoji: "📋" });
  const [showAddMember, setShowAddMember] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [newMember, setNewMember] = useState({ name: "", emoji: "🤖" });
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

  const syncTasks = async (projectId: string) => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/auto-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, days: 7 }),
      });
      const data = await res.json();
      if (data.projects) setProjects(data.projects);
      setSyncResult(
        data.added > 0
          ? t("projects.syncFound").replace("{n}", String(data.added))
          : t("projects.syncNone")
      );
    } catch {
      setSyncResult("Sync failed");
    }
    setSyncing(false);
    setTimeout(() => setSyncResult(null), 3000);
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
          <div className="flex gap-3">
            <input
              type="text"
              placeholder={t("projects.name")}
              value={newProject.name}
              onChange={(e) => setNewProject((p) => ({ ...p, name: e.target.value }))}
              className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  doAction({ action: "add-project", ...newProject });
                  setNewProject({ name: "", emoji: "📋" });
                  setShowNewProject(false);
                }
              }}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                doAction({ action: "add-project", ...newProject });
                setNewProject({ name: "", emoji: "📋" });
                setShowNewProject(false);
              }}
              className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-sm"
            >
              {t("projects.create")}
            </button>
            <button onClick={() => setShowNewProject(false)} className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)] text-sm">
              {t("projects.cancel")}
            </button>
          </div>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="text-center py-16 text-[var(--text-muted)]">{t("projects.empty")}</div>
      ) : (
        projects.map((project) => {
          const allTasks = project.members.flatMap((m) => m.tasks);
          const doneCount = allTasks.filter((t) => t.done).length;
          const totalCount = allTasks.length;
          const progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

          return (
            <div key={project.id} className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
              {/* Project header */}
              <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{project.emoji}</span>
                  <div>
                    <div className="font-semibold text-[var(--text)]">{project.name}</div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {project.members.length} {t("projects.members")} · {doneCount}/{totalCount} {t("projects.completed")}
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
                    onClick={() => syncTasks(project.id)}
                    disabled={syncing}
                    className="px-2 py-1 rounded-lg text-xs font-medium border border-[var(--accent)]/30 text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors disabled:opacity-50"
                    title="自动检测任务"
                  >
                    {syncing ? "⏳ 检测中..." : "🔄 自动检测"}
                  </button>
                  <button
                    onClick={() => setShowAddMember(showAddMember === project.id ? null : project.id)}
                    className="text-sm text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                    title="添加成员"
                  >
                    👤+
                  </button>
                  <button
                    onClick={() => { if (confirm("确定删除？")) doAction({ action: "delete-project", projectId: project.id }); }}
                    className="text-[var(--text-muted)] hover:text-red-500 transition-colors text-sm"
                  >
                    🗑
                  </button>
                </div>
              </div>

              {/* Add member form */}
              {showAddMember === project.id && (
                <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--bg)]/50 flex items-center gap-3">
                  <input
                    type="text"
                    placeholder={t("projects.memberName")}
                    value={newMember.name}
                    onChange={(e) => setNewMember((m) => ({ ...m, name: e.target.value }))}
                    className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm w-40"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newMember.name.trim()) {
                        doAction({ action: "add-member", projectId: project.id, memberName: newMember.name, memberEmoji: newMember.emoji });
                        setNewMember({ name: "", emoji: "🤖" });
                        setShowAddMember(null);
                      }
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Emoji"
                    value={newMember.emoji}
                    onChange={(e) => setNewMember((m) => ({ ...m, emoji: e.target.value }))}
                    className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm w-16 text-center"
                  />
                  <button
                    onClick={() => {
                      if (newMember.name.trim()) {
                        doAction({ action: "add-member", projectId: project.id, memberName: newMember.name, memberEmoji: newMember.emoji });
                        setNewMember({ name: "", emoji: "🤖" });
                        setShowAddMember(null);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-sm"
                  >
                    {t("projects.create")}
                  </button>
                </div>
              )}

              {/* Members grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                {project.members.map((member, mi) => {
                  const pending = member.tasks.filter((t) => !t.done);
                  const done = member.tasks.filter((t) => !t.done ? false : true);
                  const memberKey = `${project.id}:${member.name}`;

                  return (
                    <div
                      key={member.name}
                      className={`px-5 py-4 ${mi > 0 ? "border-t md:border-t-0 md:border-l" : ""} border-[var(--border)]`}
                    >
                      {/* Member header */}
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-lg">{member.emoji}</span>
                        <span className="font-semibold text-sm text-[var(--text)]">{member.name}</span>
                        <span className="text-xs text-[var(--text-muted)] ml-auto">
                          {done.length}/{member.tasks.length}
                        </span>
                      </div>

                      {/* In progress */}
                      {pending.length > 0 && (
                        <div className="mb-2">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                            <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                              {t("projects.inProgress")}
                            </span>
                          </div>
                          <div className="space-y-0.5">
                            {pending.map((task, ti) => {
                              const realIndex = member.tasks.indexOf(task);
                              return (
                                <div key={ti} className="flex items-center gap-2 py-1 group">
                                  <button
                                    onClick={() => doAction({ action: "toggle-task", projectId: project.id, memberName: member.name, taskIndex: realIndex })}
                                    className="w-4 h-4 rounded border-2 border-[var(--border)] hover:border-[var(--accent)] flex-shrink-0 transition-colors"
                                  />
                                  <span className="text-xs text-[var(--text)] flex-1">{task.text}</span>
                                  <button
                                    onClick={() => doAction({ action: "delete-task", projectId: project.id, memberName: member.name, taskIndex: realIndex })}
                                    className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-500 text-[10px] transition-all"
                                  >
                                    ✕
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Finished */}
                      {done.length > 0 && (
                        <div className="mb-2">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                            <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                              {t("projects.finished")}
                            </span>
                          </div>
                          <div className="space-y-0.5">
                            {done.map((task, ti) => {
                              const realIndex = member.tasks.indexOf(task);
                              return (
                                <div key={ti} className="flex items-center gap-2 py-1 group">
                                  <button
                                    onClick={() => doAction({ action: "toggle-task", projectId: project.id, memberName: member.name, taskIndex: realIndex })}
                                    className="w-4 h-4 rounded border-2 bg-green-500 border-green-500 text-white flex-shrink-0 text-[10px] flex items-center justify-center"
                                  >
                                    ✓
                                  </button>
                                  <span className="text-xs line-through text-[var(--text-muted)] flex-1">{task.text}</span>
                                  <button
                                    onClick={() => doAction({ action: "delete-task", projectId: project.id, memberName: member.name, taskIndex: realIndex })}
                                    className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-500 text-[10px] transition-all"
                                  >
                                    ✕
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Add task */}
                      <div className="pt-1 border-t border-[var(--border)]/30">
                        <input
                          type="text"
                          placeholder={`+ ${t("projects.addTask")}`}
                          value={newTaskText[memberKey] || ""}
                          onChange={(e) => setNewTaskText((prev) => ({ ...prev, [memberKey]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const text = newTaskText[memberKey]?.trim();
                              if (!text) return;
                              doAction({ action: "add-task", projectId: project.id, memberName: member.name, text });
                              setNewTaskText((prev) => ({ ...prev, [memberKey]: "" }));
                            }
                          }}
                          className="w-full px-2 py-1 rounded border border-transparent hover:border-[var(--border)] bg-transparent text-[var(--text)] text-xs placeholder:text-[var(--text-muted)]/40 focus:border-[var(--accent)] outline-none"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
