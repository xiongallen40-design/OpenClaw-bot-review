"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useI18n } from "@/lib/i18n";

interface Task {
  text: string;
  state: string;
  reviewRequestedAt?: string;
  completedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  reviewResult?: { verdict: string; reason: string; reviewedAt: string };
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

interface StateConfig {
  label: string;
  emoji: string;
  color: string;
}

const STATE_COLORS: Record<string, string> = {
  gray: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  blue: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  orange: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  purple: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  green: "bg-green-500/15 text-green-500 border-green-500/30",
  red: "bg-red-500/15 text-red-400 border-red-500/30",
};

const STATE_DOT: Record<string, string> = {
  gray: "bg-gray-400",
  blue: "bg-blue-400",
  orange: "bg-orange-400",
  purple: "bg-purple-500",
  green: "bg-green-500",
  red: "bg-red-400",
};

export default function ProjectsPage() {
  const { t } = useI18n();
  const [projects, setProjects] = useState<Project[]>([]);
  const [states, setStates] = useState<Record<string, StateConfig>>({});
  const [transitions, setTransitions] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [newTaskText, setNewTaskText] = useState<Record<string, string>>({});
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProject, setNewProject] = useState({ name: "", emoji: "📋" });
  const [showAddMember, setShowAddMember] = useState<string | null>(null);
  const [newMember, setNewMember] = useState({ name: "", emoji: "🤖" });
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [reviewModal, setReviewModal] = useState<{ projectId: string; memberName: string; taskIndex: number; task: Task } | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => {
        setProjects(d.projects || []);
        setStates(d.states || {});
        setTransitions(d.transitions || {});
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
    if (data.projects) {
      setProjects(data.projects);
      if (data.states) setStates(data.states);
      if (data.transitions) setTransitions(data.transitions);
    }
    return data;
  };

  const [pendingTasks, setPendingTasks] = useState<any[]>([]);
  const [showPending, setShowPending] = useState(false);

  const syncTasks = async (projectId: string) => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/pending-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "scan", days: 3 }),
      });
      const data = await res.json();
      if (data.tasks && data.tasks.length > 0) {
        setPendingTasks(data.tasks);
        setShowPending(true);
        setSyncResult(data.message);
      } else {
        setSyncResult(data.message || t("projects.syncNone"));
      }
    } catch { setSyncResult("Sync failed"); }
    setSyncing(false);
    setTimeout(() => setSyncResult(null), 5000);
  };

  const approvePendingTask = async (taskId: string, projectId: string) => {
    const res = await fetch("/api/pending-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve", taskId, projectId }),
    });
    const data = await res.json();
    if (data.projects) setProjects(data.projects);
    setPendingTasks(prev => prev.filter(t => t.id !== taskId));
  };

  const rejectPendingTask = async (taskId: string) => {
    await fetch("/api/pending-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject", taskId }),
    });
    setPendingTasks(prev => prev.filter(t => t.id !== taskId));
  };

  const approveAllPending = async (projectId: string) => {
    const res = await fetch("/api/pending-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve-all", projectId }),
    });
    const data = await res.json();
    if (data.projects) setProjects(data.projects);
    setPendingTasks([]);
    setShowPending(false);
  };

  const transitionTask = (projectId: string, memberName: string, taskIndex: number, newState: string) => {
    doAction({ action: "transition-task", projectId, memberName, taskIndex, newState });
  };

  const submitReview = (verdict: string) => {
    if (!reviewModal) return;
    doAction({
      action: "submit-review",
      projectId: reviewModal.projectId,
      memberName: reviewModal.memberName,
      taskIndex: reviewModal.taskIndex,
      verdict,
      reason: reviewReason,
    });
    setReviewModal(null);
    setReviewReason("");
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-[var(--text-muted)]">Loading...</div></div>;
  }

  // Group all tasks by state across all members for summary
  const allTasks = projects.flatMap(p => p.members.flatMap(m => m.tasks));
  const stateCounts: Record<string, number> = {};
  for (const task of allTasks) {
    const s = task.state || "todo";
    stateCounts[s] = (stateCounts[s] || 0) + 1;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">📋 {t("projects.title")}</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">{t("projects.subtitle")}</p>
        </div>
        <button onClick={() => setShowNewProject(!showNewProject)} className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90">
          + {t("projects.new")}
        </button>
      </div>

      {/* State summary pills */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(states).map(([key, cfg]) => (
          <div key={key} className={"px-3 py-1.5 rounded-lg text-xs font-medium border " + STATE_COLORS[cfg.color]}>
            {cfg.emoji} {cfg.label}: {stateCounts[key] || 0}
          </div>
        ))}
      </div>

      {/* New project form */}
      {showNewProject && (
        <div className="rounded-xl border border-[var(--accent)]/30 bg-[var(--card)] p-4 space-y-3">
          <input type="text" placeholder={t("projects.name")} value={newProject.name}
            onChange={(e) => setNewProject((p) => ({ ...p, name: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm"
            onKeyDown={(e) => { if (e.key === "Enter" && newProject.name.trim()) { doAction({ action: "add-project", ...newProject }); setNewProject({ name: "", emoji: "📋" }); setShowNewProject(false); } }}
          />
          <div className="flex gap-2">
            <button onClick={() => { doAction({ action: "add-project", ...newProject }); setNewProject({ name: "", emoji: "📋" }); setShowNewProject(false); }} className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-sm">{t("projects.create")}</button>
            <button onClick={() => setShowNewProject(false)} className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)] text-sm">{t("projects.cancel")}</button>
          </div>
        </div>
      )}

      {/* Projects */}
      {projects.length === 0 ? (
        <div className="text-center py-16 text-[var(--text-muted)]">{t("projects.empty")}</div>
      ) : (
        projects.map((project) => {
          const allT = project.members.flatMap(m => m.tasks);
          const doneCount = allT.filter(t => t.state === "done").length;
          const progress = allT.length > 0 ? Math.round((doneCount / allT.length) * 100) : 0;

          return (
            <div key={project.id} className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
              {/* Project header */}
              <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{project.emoji}</span>
                  <div>
                    <div className="font-semibold text-[var(--text)]">{project.name}</div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {project.members.length} {t("projects.members")} · {doneCount}/{allT.length} {t("projects.completed")}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-32 h-2 rounded-full bg-[var(--border)] overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: progress + "%", backgroundColor: progress === 100 ? "#22c55e" : "var(--accent)" }} />
                  </div>
                  <span className="text-xs font-mono text-[var(--text-muted)]">{progress}%</span>
                  {syncResult && <span className="text-xs text-green-500 animate-pulse">{syncResult}</span>}
                  <button onClick={() => syncTasks(project.id)} disabled={syncing}
                    className="px-2 py-1 rounded-lg text-xs font-medium border border-[var(--accent)]/30 text-[var(--accent)] hover:bg-[var(--accent)]/10 disabled:opacity-50">
                    {syncing ? "⏳" : "🔄 检测"}
                  </button>
                  <button onClick={() => setShowAddMember(showAddMember === project.id ? null : project.id)}
                    className="text-sm text-[var(--text-muted)] hover:text-[var(--accent)]">👤+</button>
                  <button onClick={() => { if (confirm("确定删除？")) doAction({ action: "delete-project", projectId: project.id }); }}
                    className="text-[var(--text-muted)] hover:text-red-500 text-sm">🗑</button>
                </div>
              </div>

              {/* Add member */}
              {showAddMember === project.id && (
                <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--bg)]/50 flex items-center gap-3">
                  <input type="text" placeholder={t("projects.memberName")} value={newMember.name}
                    onChange={(e) => setNewMember(m => ({ ...m, name: e.target.value }))}
                    className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm w-40"
                    onKeyDown={(e) => { if (e.key === "Enter" && newMember.name.trim()) { doAction({ action: "add-member", projectId: project.id, memberName: newMember.name, memberEmoji: newMember.emoji }); setNewMember({ name: "", emoji: "🤖" }); setShowAddMember(null); } }}
                  />
                  <input type="text" placeholder="Emoji" value={newMember.emoji}
                    onChange={(e) => setNewMember(m => ({ ...m, emoji: e.target.value }))}
                    className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm w-16 text-center"
                  />
                  <button onClick={() => { if (newMember.name.trim()) { doAction({ action: "add-member", projectId: project.id, memberName: newMember.name, memberEmoji: newMember.emoji }); setNewMember({ name: "", emoji: "🤖" }); setShowAddMember(null); } }}
                    className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-sm">{t("projects.create")}</button>
                </div>
              )}

              {/* Members grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                {project.members.map((member, mi) => {
                  const memberKey = project.id + ":" + member.name;
                  // Group tasks by state category
                  const activeTasks = member.tasks.map((t, i) => ({ ...t, idx: i })).filter(t => !["done", "rejected"].includes(t.state));
                  const doneTasks = member.tasks.map((t, i) => ({ ...t, idx: i })).filter(t => t.state === "done");
                  const rejectedTasks = member.tasks.map((t, i) => ({ ...t, idx: i })).filter(t => t.state === "rejected");

                  return (
                    <div key={member.name} className={"px-5 py-4 " + (mi > 0 ? "border-t md:border-t-0 md:border-l border-[var(--border)]" : "")}>
                      {/* Member header */}
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-lg">{member.emoji}</span>
                        <span className="font-semibold text-sm text-[var(--text)]">{member.name}</span>
                        <span className="text-xs text-[var(--text-muted)] ml-auto">{doneTasks.length}/{member.tasks.length}</span>
                      </div>

                      {/* Active tasks (todo, planning, review, doing) */}
                      {activeTasks.length > 0 && (
                        <div className="mb-3 space-y-1.5">
                          {activeTasks.map((task) => {
                            const stateConfig = states[task.state] || { label: task.state, emoji: "❓", color: "gray" };
                            const allowed = transitions[task.state] || [];
                            return (
                              <div key={task.idx} className="group">
                                <div className="flex items-start gap-2 py-1">
                                  <span className={"w-2 h-2 rounded-full mt-1.5 flex-shrink-0 " + (STATE_DOT[stateConfig.color] || "bg-gray-400")} />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-[var(--text)]">{task.text}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-1">
                                      <span className={"px-1.5 py-0.5 rounded text-[9px] font-medium border " + STATE_COLORS[stateConfig.color]}>
                                        {stateConfig.emoji} {stateConfig.label}
                                      </span>
                                      {/* Transition buttons */}
                                      {allowed.map((nextState) => {
                                        const nextConfig = states[nextState] || { label: nextState, emoji: "→", color: "gray" };
                                        return (
                                          <button key={nextState}
                                            onClick={() => {
                                              if (nextState === "review") {
                                                transitionTask(project.id, member.name, task.idx, "review");
                                              } else {
                                                transitionTask(project.id, member.name, task.idx, nextState);
                                              }
                                            }}
                                            className="px-1.5 py-0.5 rounded text-[9px] font-medium opacity-0 group-hover:opacity-100 transition-opacity bg-[var(--bg)] text-[var(--text-muted)] hover:text-[var(--accent)] border border-[var(--border)]"
                                          >
                                            → {nextConfig.emoji} {nextConfig.label}
                                          </button>
                                        );
                                      })}
                                      {/* Review action for tasks in review state */}
                                      {task.state === "review" && (
                                        <button onClick={() => setReviewModal({ projectId: project.id, memberName: member.name, taskIndex: task.idx, task })}
                                          className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30">
                                          🛡️ 审核
                                        </button>
                                      )}
                                      <button onClick={() => doAction({ action: "delete-task", projectId: project.id, memberName: member.name, taskIndex: task.idx })}
                                        className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-500 text-[9px] transition-all">✕</button>
                                    </div>
                                    {/* Show rejection reason */}
                                    {task.state === "rejected" && task.rejectionReason && (
                                      <div className="mt-1 text-[10px] text-red-400 bg-red-500/10 px-2 py-1 rounded">
                                        🚫 {task.rejectionReason}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Done tasks */}
                      {doneTasks.length > 0 && (
                        <div className="mb-2">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                            <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                              {t("projects.finished")} ({doneTasks.length})
                            </span>
                          </div>
                          <div className="space-y-0.5">
                            {doneTasks.map((task) => (
                              <div key={task.idx} className="flex items-center gap-2 py-0.5 group">
                                <span className="text-green-500 text-xs">✓</span>
                                <span className="text-xs line-through text-[var(--text-muted)] flex-1">{task.text}</span>
                                <button onClick={() => doAction({ action: "delete-task", projectId: project.id, memberName: member.name, taskIndex: task.idx })}
                                  className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-500 text-[9px]">✕</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Rejected tasks */}
                      {rejectedTasks.length > 0 && (
                        <div className="mb-2">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                            <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                              封驳 ({rejectedTasks.length})
                            </span>
                          </div>
                          <div className="space-y-1">
                            {rejectedTasks.map((task) => (
                              <div key={task.idx} className="group">
                                <div className="flex items-center gap-2 py-0.5">
                                  <span className="text-red-400 text-xs">🚫</span>
                                  <span className="text-xs text-red-400/70 flex-1">{task.text}</span>
                                  <button onClick={() => transitionTask(project.id, member.name, task.idx, "planning")}
                                    className="px-1.5 py-0.5 rounded text-[9px] bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/25 opacity-0 group-hover:opacity-100">
                                    🔄 重做
                                  </button>
                                </div>
                                {task.rejectionReason && (
                                  <div className="ml-5 text-[10px] text-red-400/60">{task.rejectionReason}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Add task */}
                      <div className="pt-1 border-t border-[var(--border)]/30">
                        <input type="text" placeholder={"+ " + t("projects.addTask")}
                          value={newTaskText[memberKey] || ""}
                          onChange={(e) => setNewTaskText(prev => ({ ...prev, [memberKey]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const text = newTaskText[memberKey]?.trim();
                              if (!text) return;
                              doAction({ action: "add-task", projectId: project.id, memberName: member.name, text });
                              setNewTaskText(prev => ({ ...prev, [memberKey]: "" }));
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

      {/* Pending Tasks Panel */}
      {showPending && pendingTasks.length > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowPending(false)}>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 w-[600px] max-w-[90vw] max-h-[80vh] overflow-auto space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-[var(--text)] text-lg">🧠 AI 归纳的任务</div>
                <div className="text-xs text-[var(--text-muted)]">MiniMax M2.5 从对话中提取并归纳，请确认</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => approveAllPending(projects[0]?.id)}
                  className="px-3 py-1.5 rounded-lg bg-green-500 text-white text-xs font-medium hover:bg-green-600">
                  ✅ 全部通过
                </button>
                <button onClick={() => setShowPending(false)}
                  className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)] text-xs">
                  关闭
                </button>
              </div>
            </div>
            <div className="space-y-3">
              {pendingTasks.map((task: any) => (
                <div key={task.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={"px-1.5 py-0.5 rounded text-[9px] font-medium " + (
                          task.priority === "high" ? "bg-red-500/15 text-red-400" :
                          task.priority === "low" ? "bg-gray-500/15 text-gray-400" :
                          "bg-blue-500/15 text-blue-400"
                        )}>
                          {task.priority === "high" ? "🔴" : task.priority === "low" ? "⚪" : "🔵"} {task.priority}
                        </span>
                        <span className="text-xs text-[var(--text-muted)]">👤 {task.agentName}</span>
                      </div>
                      <div className="text-sm font-medium text-[var(--text)] mt-1">{task.title}</div>
                      {task.description && (
                        <div className="text-xs text-[var(--text-muted)] mt-0.5">{task.description}</div>
                      )}
                      {task.source && task.source.length > 0 && (
                        <div className="mt-1.5 text-[10px] text-[var(--text-muted)]/60">
                          原始消息：{task.source.filter(Boolean).slice(0, 2).join(" | ")}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button onClick={() => approvePendingTask(task.id, projects[0]?.id)}
                        className="px-2 py-1 rounded text-xs bg-green-500/15 text-green-500 hover:bg-green-500/25 border border-green-500/30">
                        ✅
                      </button>
                      <button onClick={() => rejectPendingTask(task.id)}
                        className="px-2 py-1 rounded text-xs bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/30">
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {reviewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setReviewModal(null)}>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 w-[480px] max-w-[90vw] space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <span className="text-2xl">🛡️</span>
              <div>
                <div className="font-semibold text-[var(--text)]">门下省审核</div>
                <div className="text-xs text-[var(--text-muted)]">Vesemir · 审议把关</div>
              </div>
            </div>
            <div className="px-4 py-3 rounded-lg bg-[var(--bg)] border border-[var(--border)]">
              <div className="text-xs text-[var(--text-muted)] mb-1">待审任务</div>
              <div className="text-sm text-[var(--text)]">{reviewModal.task.text}</div>
              <div className="text-[10px] text-[var(--text-muted)] mt-1">
                负责人：{reviewModal.memberName}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-1.5">审核意见</div>
              <textarea value={reviewReason} onChange={(e) => setReviewReason(e.target.value)}
                placeholder="可行性、完整性、风险、资源……"
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm h-24 resize-none outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => submitReview("approved")}
                className="flex-1 px-4 py-2 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600">
                ✅ 准奏
              </button>
              <button onClick={() => submitReview("rejected")}
                className="flex-1 px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600">
                🚫 封驳
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
