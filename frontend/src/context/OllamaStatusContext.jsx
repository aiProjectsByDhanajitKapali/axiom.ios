import { createContext, useCallback, useContext, useEffect, useState } from "react";

const POLL_MS = 5000;

const defaultStatus = {
  loading: true,
  ollama: { ready: false, host: "", error: null },
  models: {
    ready: false,
    llm: { name: "", installed: false, loaded: false, ready: false },
    embed: { name: "", installed: false, loaded: false, ready: false },
  },
};

const OllamaStatusContext = createContext(null);

export function OllamaStatusProvider({ children }) {
  const [status, setStatus] = useState(defaultStatus);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Status check failed");
      setStatus({
        loading: false,
        ollama: data.ollama ?? defaultStatus.ollama,
        models: data.models ?? defaultStatus.models,
      });
    } catch (err) {
      setStatus((prev) => ({
        ...prev,
        loading: false,
        ollama: { ...prev.ollama, ready: false, error: err.message },
        models: { ...prev.models, ready: false },
      }));
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <OllamaStatusContext.Provider value={{ status, refresh }}>
      {children}
    </OllamaStatusContext.Provider>
  );
}

export function useOllamaStatus() {
  const ctx = useContext(OllamaStatusContext);
  if (!ctx) {
    throw new Error("useOllamaStatus must be used within OllamaStatusProvider");
  }
  return ctx;
}
