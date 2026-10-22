'use client';

import { useEffect, useState } from 'react';

/**
 * Живой статус сервиса вместо захардкоженного «работает штатно».
 *
 * Статичная зелёная точка врала в обе стороны: при лежащей БД она всё равно
 * горела зелёным, а пользы от неё не было никакой — декорация. Теперь статус
 * спрашивается у /api/health: зелёный — отвечает и пишет в базу, жёлтый —
 * деградировал, серый — не смогли спросить. Текст честный в каждом случае.
 */
export function ServiceStatus() {
  const [state, setState] = useState<'ok' | 'degraded' | 'unknown'>('unknown');

  useEffect(() => {
    let alive = true;
    fetch('/api/health', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (alive) setState(d?.status === 'ok' ? 'ok' : 'degraded');
      })
      .catch(() => {
        if (alive) setState('unknown');
      });
    return () => {
      alive = false;
    };
  }, []);

  const dot =
    state === 'ok' ? 'bg-success' : state === 'degraded' ? 'bg-warn' : 'bg-line-strong';
  const label =
    state === 'ok'
      ? 'Сервис работает штатно'
      : state === 'degraded'
        ? 'Сервис деградировал — чиним'
        : 'Статус неизвестен';

  return (
    <p
      className="mt-5 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.1em] text-muted"
      role="status"
    >
      <span className={`inline-block size-1.5 rounded-full ${dot}`} aria-hidden />
      {label}
    </p>
  );
}
