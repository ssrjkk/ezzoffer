"use client";

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode; fallback?: ReactNode };
type State = { hasError: boolean; error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
            <h1 className="text-2xl font-bold text-white">Что-то пошло не так</h1>
            <p className="text-slate-400">{this.state.error?.message ?? "Неизвестная ошибка"}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="rounded-full bg-violet-600 px-5 py-2 text-sm font-semibold text-white"
            >
              Попробовать снова
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}