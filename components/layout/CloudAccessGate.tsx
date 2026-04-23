"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { isCloudDeployTarget } from "@/lib/runtimeMode";

const STORAGE_KEY = "cfh_cloud_gate_passed";
const LOGIN_USERNAME = "cfh";
const LOGIN_PASSWORD = "chenboshizuimeili";

export function CloudAccessGate() {
  const enabled = isCloudDeployTarget();
  const [checked, setChecked] = useState(!enabled);
  const [passed, setPassed] = useState(!enabled);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const stored = window.localStorage.getItem(STORAGE_KEY);
    setPassed(stored === "true");
    setChecked(true);
  }, [enabled]);

  const canPass = useMemo(() => {
    const normalizedUsername = username.trim();
    const normalizedPassword = password.trim();
    return (
      (normalizedUsername === LOGIN_USERNAME && normalizedPassword === LOGIN_PASSWORD) ||
      (normalizedUsername.length === 0 && normalizedPassword.length === 0)
    );
  }, [password, username]);

  if (!enabled || (checked && passed)) {
    return null;
  }

  const handleEnter = () => {
    if (!canPass) {
      setError("账号或密码不正确。");
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, "true");
    setPassed(true);
    setError("");
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cfh-muted">CFH</p>
          <h2 className="text-2xl font-semibold text-cfh-ink">进入系统</h2>
          <p className="text-sm text-cfh-muted">
            当前为云端代理模式。该入口仅用于演示体验，不承担真实安全认证。
          </p>
        </div>

        <div className="mt-6 space-y-4">
          <label className="block text-sm text-cfh-muted">
            用户名
            <input
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-cfh-ink outline-none ring-cfh-accent focus:ring-2"
              onChange={(event) => setUsername(event.target.value)}
              placeholder="输入用户名"
              value={username}
            />
          </label>
          <label className="block text-sm text-cfh-muted">
            密码
            <input
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-cfh-ink outline-none ring-cfh-accent focus:ring-2"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="输入密码"
              type="password"
              value={password}
            />
          </label>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-cfh-muted">输入固定账号密码，或保持为空后直接进入。</p>
            <Button onClick={handleEnter} type="button">
              进入系统
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

