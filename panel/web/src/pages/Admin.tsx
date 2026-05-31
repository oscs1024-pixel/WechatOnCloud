import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type PanelUser, type InstanceWithStatus } from '../api';
import { useUI, PasswordInput } from '../ui';

const BUSY_PHASES = ['downloading', 'extracting', 'installing'];

export default function Admin() {
  const nav = useNavigate();
  const { toast, confirm } = useUI();
  const [users, setUsers] = useState<PanelUser[]>([]);
  const [instances, setInstances] = useState<InstanceWithStatus[]>([]);
  const [err, setErr] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);
  const [creatingInst, setCreatingInst] = useState(false);
  const [assignInst, setAssignInst] = useState<InstanceWithStatus | null>(null); // 给实例选账户
  const [assignUser, setAssignUser] = useState<PanelUser | null>(null); // 给账户选实例
  const [resetTarget, setResetTarget] = useState<PanelUser | null>(null); // 重置密码弹窗
  const [deleteInst, setDeleteInst] = useState<InstanceWithStatus | null>(null); // 删除实例弹窗
  const [renameInst, setRenameInst] = useState<InstanceWithStatus | null>(null); // 重命名实例弹窗
  const [starting, setStarting] = useState<Set<string>>(new Set());

  const subs = users.filter((u) => u.role !== 'admin');
  const timer = useRef<number | undefined>(undefined);

  const load = async () => {
    try {
      const [{ users }, { instances }] = await Promise.all([api.listUsers(), api.listInstances()]);
      setUsers(users);
      setInstances(instances);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  useEffect(() => {
    load();
    return () => window.clearTimeout(timer.current);
  }, []);

  // 安装/更新进行中时轮询进度
  useEffect(() => {
    window.clearTimeout(timer.current);
    if (instances.some((i) => BUSY_PHASES.includes(i.wechat.phase))) timer.current = window.setTimeout(load, 1500);
    return () => window.clearTimeout(timer.current);
  }, [instances]);

  const trigger = async (inst: InstanceWithStatus, kind: 'install' | 'update') => {
    try {
      await (kind === 'install' ? api.instanceWechatInstall(inst.id) : api.instanceWechatUpdate(inst.id));
      setInstances((list) =>
        list.map((i) =>
          i.id === inst.id ? { ...i, wechat: { ...i.wechat, phase: 'downloading', percent: -1, message: '正在准备…' } } : i,
        ),
      );
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(load, 1000);
      toast(kind === 'install' ? '已开始下载微信' : '已开始更新', 'ok');
    } catch (e: any) {
      toast(e.message || '操作失败', 'error');
    }
  };

  const start = async (inst: InstanceWithStatus) => {
    setStarting((s) => new Set(s).add(inst.id));
    try {
      await api.instanceStart(inst.id);
      toast('实例已启动', 'ok');
      await load();
    } catch (e: any) {
      toast(e.message || '启动失败', 'error');
    } finally {
      setStarting((s) => {
        const n = new Set(s);
        n.delete(inst.id);
        return n;
      });
    }
  };

  const instName = (id: string) => instances.find((i) => i.id === id)?.name || id;
  const usersForInstance = (id: string) => subs.filter((u) => u.allowedInstances.includes(id));

  const toggle = async (u: PanelUser) => {
    try {
      await api.setDisabled(u.id, !u.disabled);
      toast(u.disabled ? '已启用' : '已禁用', 'ok');
    } catch (e: any) {
      toast(e.message, 'error');
    }
    load();
  };
  const removeUser = async (u: PanelUser) => {
    const ok = await confirm({ title: `删除子账号「${u.username}」？`, body: '该账户将无法再登录。', danger: true, confirmText: '删除' });
    if (!ok) return;
    try {
      await api.deleteUser(u.id);
      toast('已删除', 'ok');
    } catch (e: any) {
      toast(e.message, 'error');
    }
    load();
  };

  return (
    <div className="page">
      <header className="topbar">
        <button className="btn-text" onClick={() => nav('/')}>
          ‹ 返回
        </button>
        <span className="topbar-title">管理</span>
        <span style={{ width: 48 }} />
      </header>

      <main className="content">
        {err && <div className="error">{err}</div>}

        <div className="section-row">
          <span className="section-title">微信实例</span>
          <button className="btn-text" onClick={() => setCreatingInst(true)}>
            + 新建实例
          </button>
        </div>
        {instances.length === 0 ? (
          <div className="list">
            <div className="muted small" style={{ padding: '14px 16px' }}>暂无实例</div>
          </div>
        ) : (
          <div className="inst-grid">
            {instances.map((inst) => (
              <InstanceAdminCard
                key={inst.id}
                inst={inst}
                userCount={usersForInstance(inst.id).length}
                starting={starting.has(inst.id)}
                onTrigger={trigger}
                onStart={() => start(inst)}
                onRename={() => setRenameInst(inst)}
                onAssign={() => setAssignInst(inst)}
                onDelete={() => setDeleteInst(inst)}
              />
            ))}
          </div>
        )}

        <div className="section-row" style={{ marginTop: 22 }}>
          <span className="section-title">子账号</span>
          <button className="btn-text" onClick={() => setCreatingUser(true)}>
            + 新建子账号
          </button>
        </div>
        <div className="list">
          {users.map((u) => (
            <div key={u.id} className="user-row">
              <div className="user-main">
                <span className="user-name">
                  {u.username}
                  {u.role === 'admin' && <span className="tag">管理员</span>}
                  {u.disabled && <span className="tag tag-off">已禁用</span>}
                </span>
                {u.role === 'admin' ? (
                  <span className="muted small">可访问全部实例</span>
                ) : u.allowedInstances.length > 0 ? (
                  <span className="chip-row">
                    {u.allowedInstances.map((id) => (
                      <span key={id} className="chip chip-static">
                        {instName(id)}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="muted small">未分配实例</span>
                )}
              </div>
              {u.role !== 'admin' && (
                <div className="user-actions">
                  <button className="btn-text" onClick={() => setAssignUser(u)}>
                    可访问实例
                  </button>
                  <button className="btn-text" onClick={() => toggle(u)}>
                    {u.disabled ? '启用' : '禁用'}
                  </button>
                  <button className="btn-text" onClick={() => setResetTarget(u)}>
                    重置密码
                  </button>
                  <button className="btn-text danger" onClick={() => removeUser(u)}>
                    删除
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>

      {creatingUser && (
        <CreateUser
          instances={instances}
          onClose={() => setCreatingUser(false)}
          onDone={() => {
            setCreatingUser(false);
            load();
          }}
        />
      )}
      {creatingInst && (
        <CreateInstance
          subs={subs}
          onClose={() => setCreatingInst(false)}
          onDone={() => {
            setCreatingInst(false);
            load();
          }}
        />
      )}
      {assignInst && (
        <AssignUsers
          inst={assignInst}
          subs={subs}
          onClose={() => setAssignInst(null)}
          onDone={() => {
            setAssignInst(null);
            load();
          }}
        />
      )}
      {assignUser && (
        <AssignInstances
          user={assignUser}
          instances={instances}
          onClose={() => setAssignUser(null)}
          onDone={() => {
            setAssignUser(null);
            load();
          }}
        />
      )}
      {resetTarget && (
        <ResetPassword
          user={resetTarget}
          onClose={() => setResetTarget(null)}
          onDone={() => {
            setResetTarget(null);
            toast('密码已重置', 'ok');
          }}
        />
      )}
      {deleteInst && (
        <DeleteInstance
          inst={deleteInst}
          onClose={() => setDeleteInst(null)}
          onDone={() => {
            setDeleteInst(null);
            toast('实例已删除', 'ok');
            load();
          }}
        />
      )}
      {renameInst && (
        <RenameInstance
          inst={renameInst}
          onClose={() => setRenameInst(null)}
          onDone={() => {
            setRenameInst(null);
            toast('已重命名', 'ok');
            load();
          }}
        />
      )}
    </div>
  );
}

function RenameInstance({ inst, onClose, onDone }: { inst: InstanceWithStatus; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(inst.name);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await api.renameInstance(inst.id, name.trim());
      onDone();
    } catch (e: any) {
      setErr(e.message || '重命名失败');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-mask" onClick={onClose}>
      <form className="card modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>重命名实例</h2>
        <input className="input" placeholder="实例名称" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        {err && <div className="error">{err}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" disabled={busy || !name.trim() || name.trim() === inst.name}>
            保存
          </button>
        </div>
      </form>
    </div>
  );
}

function ResetPassword({ user, onClose, onDone }: { user: PanelUser; onClose: () => void; onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const mismatch = confirm.length > 0 && pw !== confirm;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (pw !== confirm) {
      setErr('两次输入的新密码不一致');
      return;
    }
    setBusy(true);
    try {
      await api.resetUser(user.id, pw);
      onDone();
    } catch (e: any) {
      setErr(e.message || '重置失败');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-mask" onClick={onClose}>
      <form className="card modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>重置「{user.username}」的密码</h2>
        <PasswordInput placeholder="新密码（至少 6 位）" autoComplete="new-password" value={pw} onChange={setPw} />
        <PasswordInput placeholder="再次输入新密码" autoComplete="new-password" value={confirm} onChange={setConfirm} />
        {(mismatch || err) && <div className="error">{mismatch ? '两次输入的新密码不一致' : err}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" disabled={busy || pw.length < 6 || pw !== confirm}>
            重置
          </button>
        </div>
      </form>
    </div>
  );
}

function DeleteInstance({ inst, onClose, onDone }: { inst: InstanceWithStatus; onClose: () => void; onDone: () => void }) {
  const [purge, setPurge] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setErr('');
    setBusy(true);
    try {
      await api.deleteInstance(inst.id, purge);
      onDone();
    } catch (e: any) {
      setErr(e.message || '删除失败');
      setBusy(false);
    }
  };
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="card modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
        <h2>删除实例「{inst.name}」？</h2>
        <div className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
          容器会被移除。默认保留聊天记录（数据卷），之后可重建同名实例恢复。
        </div>
        <label className={'purge-opt' + (purge ? ' on' : '')} onClick={() => setPurge((v) => !v)}>
          <span className="purge-check">{purge ? '✓' : ''}</span>
          <span>
            同时永久删除聊天记录（数据卷）
            <span className="muted small" style={{ display: 'block' }}>不可恢复，请谨慎勾选</span>
          </span>
        </label>
        {err && <div className="error">{err}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn btn-danger" disabled={busy} onClick={submit}>
            {purge ? '连数据一起删除' : '删除实例'}
          </button>
        </div>
      </div>
    </div>
  );
}

// 管理页的实例卡片：含微信版本管理（下载/更新）+ 重命名/分配/删除
function InstanceAdminCard({
  inst,
  userCount,
  starting,
  onTrigger,
  onStart,
  onRename,
  onAssign,
  onDelete,
}: {
  inst: InstanceWithStatus;
  userCount: number;
  starting?: boolean;
  onTrigger: (inst: InstanceWithStatus, kind: 'install' | 'update') => void;
  onStart: () => void;
  onRename: () => void;
  onAssign: () => void;
  onDelete: () => void;
}) {
  const wx = inst.wechat;
  const busy = BUSY_PHASES.includes(wx.phase);
  const installed = wx.installed && wx.phase !== 'downloading';
  const offline = inst.runtime !== 'running';

  let badge: { text: string; cls: string };
  if (offline) badge = { text: inst.runtime === 'missing' ? '未创建' : '已停止', cls: 'tag-off' };
  else if (busy) badge = { text: '处理中', cls: 'tag-busy' };
  else if (installed) badge = { text: '在线', cls: 'tag-on' };
  else badge = { text: '待安装', cls: 'tag-warn' };

  let sub: string;
  if (busy) sub = wx.percent >= 0 ? `${wx.message || '处理中'} ${wx.percent}%` : wx.message || '请稍候…';
  else if (wx.phase === 'error') sub = wx.message || '操作失败，可重试';
  else if (offline) sub = inst.runtime === 'missing' ? '容器尚未创建' : '容器已停止';
  else if (installed) sub = wx.version ? `微信 ${wx.version}` : '微信已安装';
  else sub = '微信尚未安装';

  return (
    <div className="inst-card">
      <div className="inst-head">
        <span className="inst-name">{inst.name}</span>
        <span className={'tag ' + badge.cls}>{badge.text}</span>
      </div>
      <div className="inst-sub">
        {sub} · 可访问 {userCount} 人
      </div>

      {busy && (
        <div className="wx-progress">
          <div
            className={'wx-progress-bar' + (wx.percent < 0 ? ' indeterminate' : '')}
            style={wx.percent >= 0 ? { width: `${wx.percent}%` } : undefined}
          />
        </div>
      )}

      {!busy && (
        <div className="inst-actions">
          {offline ? (
            <button className="btn btn-primary inst-act-wide" disabled={starting} onClick={onStart}>
              {starting ? '启动中…' : inst.runtime === 'missing' ? '创建并启动' : '启动实例'}
            </button>
          ) : installed ? (
            <button className="btn btn-primary inst-act-wide" onClick={() => onTrigger(inst, 'update')}>
              更新微信
            </button>
          ) : (
            <button className="btn btn-primary inst-act-wide" onClick={() => onTrigger(inst, 'install')}>
              下载安装微信
            </button>
          )}
        </div>
      )}

      <div className="inst-admin-links">
        <button className="btn-text" onClick={onRename}>
          重命名
        </button>
        <button className="btn-text" onClick={onAssign}>
          分配账户
        </button>
        <button className="btn-text danger" onClick={onDelete}>
          删除
        </button>
      </div>
    </div>
  );
}

// 通用 chip 多选
function ChipMultiSelect({
  options,
  selected,
  onToggle,
  empty,
}: {
  options: { id: string; label: string }[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  empty: string;
}) {
  if (options.length === 0) return <div className="muted small">{empty}</div>;
  return (
    <div className="chip-row chip-row-pick">
      {options.map((o) => (
        <button
          type="button"
          key={o.id}
          className={'chip chip-toggle' + (selected.has(o.id) ? ' on' : '')}
          onClick={() => onToggle(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function CreateUser({ instances, onClose, onDone }: { instances: InstanceWithStatus[]; onClose: () => void; onDone: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await api.createUser(username.trim(), password, [...sel]);
      onDone();
    } catch (e: any) {
      setErr(e.message || '创建失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <form className="card modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>新建子账号</h2>
        <input
          className="input"
          placeholder="用户名（3-20 位字母/数字/下划线）"
          autoCapitalize="off"
          autoCorrect="off"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <PasswordInput placeholder="初始密码（至少 6 位）" autoComplete="new-password" value={password} onChange={setPassword} />
        <div className="field-label">可访问的微信实例</div>
        <ChipMultiSelect
          options={instances.map((i) => ({ id: i.id, label: i.name }))}
          selected={sel}
          onToggle={(id) => setSel((s) => toggleSet(s, id))}
          empty="暂无实例，可稍后在账户里分配"
        />
        {err && <div className="error">{err}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" disabled={busy || !username || !password}>
            创建
          </button>
        </div>
      </form>
    </div>
  );
}

function CreateInstance({ subs, onClose, onDone }: { subs: PanelUser[]; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await api.createInstance(name.trim(), [...sel]);
      onDone();
    } catch (e: any) {
      setErr(e.message || '创建失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <form className="card modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>新建微信实例</h2>
        <input className="input" placeholder="实例名称（如：我的微信 / 公司号）" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="field-label">允许访问的子账号（管理员默认可访问全部）</div>
        <ChipMultiSelect
          options={subs.map((u) => ({ id: u.id, label: u.username }))}
          selected={sel}
          onToggle={(id) => setSel((s) => toggleSet(s, id))}
          empty="暂无子账号"
        />
        {err && <div className="error">{err}</div>}
        <div className="muted small" style={{ marginTop: 4 }}>创建后会拉起一个新的微信容器，进入后扫码登录。</div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" disabled={busy || !name.trim()}>
            创建
          </button>
        </div>
      </form>
    </div>
  );
}

function AssignUsers({
  inst,
  subs,
  onClose,
  onDone,
}: {
  inst: InstanceWithStatus;
  subs: PanelUser[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set(subs.filter((u) => u.allowedInstances.includes(inst.id)).map((u) => u.id)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      await api.setInstanceUsers(inst.id, [...sel]);
      onDone();
    } catch (e: any) {
      setErr(e.message || '保存失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="card modal" onClick={(e) => e.stopPropagation()}>
        <h2>「{inst.name}」可访问账户</h2>
        <ChipMultiSelect
          options={subs.map((u) => ({ id: u.id, label: u.username }))}
          selected={sel}
          onToggle={(id) => setSel((s) => toggleSet(s, id))}
          empty="暂无子账号"
        />
        {err && <div className="error">{err}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function AssignInstances({
  user,
  instances,
  onClose,
  onDone,
}: {
  user: PanelUser;
  instances: InstanceWithStatus[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set(user.allowedInstances));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      await api.setUserInstances(user.id, [...sel]);
      onDone();
    } catch (e: any) {
      setErr(e.message || '保存失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="card modal" onClick={(e) => e.stopPropagation()}>
        <h2>{user.username} 可访问实例</h2>
        <ChipMultiSelect
          options={instances.map((i) => ({ id: i.id, label: i.name }))}
          selected={sel}
          onToggle={(id) => setSel((s) => toggleSet(s, id))}
          empty="暂无实例"
        />
        {err && <div className="error">{err}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function toggleSet(s: Set<string>, id: string): Set<string> {
  const next = new Set(s);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
