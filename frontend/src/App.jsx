import { useState } from "react";
import AskTab from "./components/AskTab";
import FridayMode from "./components/friday/FridayMode";
import HeaderStatus from "./components/HeaderStatus";
import TrainTab from "./components/TrainTab";
import VoiceTab from "./components/VoiceTab";
import { OllamaStatusProvider } from "./context/OllamaStatusContext";

const TABS = [
  { id: "ask", label: "Ask" },
  { id: "voice", label: "Voice" },
  { id: "train", label: "Train" },
];

function AppShell() {
  const [activeTab, setActiveTab] = useState("ask");
  const [fridayOpen, setFridayOpen] = useState(false);

  return (
    <>
      <div className="min-h-screen flex flex-col">
        <header className="sticky top-0 z-10 border-b border-white/5 bg-axiom-bg/80 backdrop-blur-xl">
          <div className="flex items-center justify-between px-6 h-14 gap-4">
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-axiom-accent to-axiom-accent2 text-sm font-bold text-axiom-bg shadow-lg shadow-axiom-accent/20">
                A
              </div>
              <h1 className="text-[15px] font-semibold tracking-tight">
                Axiom<span className="text-axiom-muted font-normal">.ios</span>
              </h1>
            </div>
            <HeaderStatus />
            <nav className="flex items-center gap-1 rounded-full border border-axiom-border bg-axiom-panel/80 p-1 shrink-0">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                    activeTab === tab.id
                      ? "bg-axiom-accent text-axiom-bg shadow-md shadow-axiom-accent/25"
                      : "text-axiom-muted hover:text-gray-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setFridayOpen(true)}
                className="ml-1 px-4 py-1.5 rounded-full text-sm font-medium transition text-cyan-300/90 hover:text-cyan-200 border border-cyan-500/30 hover:border-cyan-400/50 hover:bg-cyan-500/10"
              >
                Friday
              </button>
            </nav>
          </div>
        </header>

        <main className="flex-1">
          {activeTab === "ask" && <AskTab />}
          {activeTab === "voice" && <VoiceTab />}
          {activeTab === "train" && <TrainTab />}
        </main>
      </div>

      {fridayOpen && <FridayMode onClose={() => setFridayOpen(false)} />}
    </>
  );
}

export default function App() {
  return (
    <OllamaStatusProvider>
      <AppShell />
    </OllamaStatusProvider>
  );
}
