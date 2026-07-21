import { useCallback, useEffect, useRef, useState } from "react";
import { createSpeechDetector } from "../utils/speechDetector";

const SILENCE_MS = 1500;
const MIN_RECORD_MS = 400;
const MAX_RECORD_MS = 60000;
const LISTEN_GRACE_MS = 2000;
const LEVEL_HISTORY = 56;
const WORLD_MONITOR_URL = "https://worldmonitor.app/";

/**
 * Friday voice loop: greet → listen → transcribe → friday ask → speak → (optional monitor).
 */
export function useFridaySession() {
  const [phase, setPhase] = useState("idle");
  const [micEnabled, setMicEnabled] = useState(true);
  const [transcript, setTranscript] = useState("");
  const [lastAnswer, setLastAnswer] = useState("");
  const [greeting, setGreeting] = useState("");
  const [error, setError] = useState(null);
  const [voiceReady, setVoiceReady] = useState(null);
  const [audioLevels, setAudioLevels] = useState(() => Array(LEVEL_HISTORY).fill(0));
  const [isSilent, setIsSilent] = useState(false);

  const streamRef = useRef(null);
  const levelsRef = useRef([]);
  const vizFrameRef = useRef(0);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const analyserRef = useRef(null);
  const audioContextRef = useRef(null);
  const rafRef = useRef(null);
  const recordStartRef = useRef(0);
  const silenceStartRef = useRef(null);
  const phaseRef = useRef(phase);
  const activeRef = useRef(false);
  const micEnabledRef = useRef(micEnabled);
  const audioRef = useRef(null);
  const greetedRef = useRef(false);

  phaseRef.current = phase;
  micEnabledRef.current = micEnabled;

  const checkVoiceStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/voice/status");
      const data = await res.json();
      const ready = data.enabled && data.stt?.ready && data.tts?.ready;
      setVoiceReady(ready);
      if (!ready) {
        const err = !data.enabled
          ? "Voice is disabled on the server"
          : data.stt?.error ||
            data.tts?.error ||
            "Voice models not ready. Run ./scripts/download_voice_models.sh";
        setError(err);
      } else {
        setError(null);
      }
      return ready;
    } catch {
      setVoiceReady(false);
      setError("Cannot reach voice API");
      return false;
    }
  }, []);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
  }, []);

  const cleanupMic = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try {
        recorderRef.current.stop();
      } catch {
        /* ignore */
      }
    }
    recorderRef.current = null;
    chunksRef.current = [];
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    silenceStartRef.current = null;
    levelsRef.current = [];
    setAudioLevels(Array(LEVEL_HISTORY).fill(0));
    setIsSilent(false);
  }, []);

  const speakText = useCallback(
    (text) =>
      new Promise((resolve, reject) => {
        if (!text?.trim() || !activeRef.current) {
          resolve();
          return;
        }

        setPhase("speaking");
        fetch("/api/voice/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        })
          .then(async (speakRes) => {
            if (!speakRes.ok) {
              const errBody = await speakRes.json().catch(() => ({}));
              throw new Error(errBody.detail || "Speech synthesis failed");
            }
            const wavBlob = await speakRes.blob();
            const url = URL.createObjectURL(wavBlob);
            const audio = new Audio(url);
            audioRef.current = audio;
            audio.onended = () => {
              URL.revokeObjectURL(url);
              audioRef.current = null;
              resolve();
            };
            audio.onerror = () => {
              URL.revokeObjectURL(url);
              reject(new Error("Playback failed"));
            };
            return audio.play();
          })
          .catch(reject);
      }),
    []
  );

  const startListeningRef = useRef(null);

  const startListening = useCallback(async () => {
    if (!activeRef.current || !micEnabledRef.current) return;

    cleanupMic();
    chunksRef.current = [];
    silenceStartRef.current = null;
    recordStartRef.current = Date.now();
    levelsRef.current = [];
    vizFrameRef.current = 0;
    setAudioLevels(Array(LEVEL_HISTORY).fill(0));
    setIsSilent(false);
    setPhase("listening");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";

      let recorder;
      try {
        recorder = new MediaRecorder(stream, { mimeType });
      } catch {
        recorder = new MediaRecorder(stream);
      }
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        if (audioContextRef.current) {
          audioContextRef.current.close().catch(() => {});
          audioContextRef.current = null;
        }
        analyserRef.current = null;
        recorderRef.current = null;
        if (!activeRef.current) return;
        if (blob.size > 0) {
          processUtteranceRef.current?.(blob, mimeType);
        } else if (micEnabledRef.current) {
          setPhase("listening");
          startListeningRef.current?.();
        }
      };
      recorder.start(250);

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;

      const detector = createSpeechDetector(analyser, audioContext.sampleRate);

      const tick = () => {
        if (!activeRef.current || !analyserRef.current || !micEnabledRef.current) return;
        const { level, silent } = detector.sample();
        const elapsed = Date.now() - recordStartRef.current;

        levelsRef.current.push(level);
        if (levelsRef.current.length > LEVEL_HISTORY) {
          levelsRef.current.shift();
        }

        const pastGrace = elapsed >= LISTEN_GRACE_MS;
        const silentNow = pastGrace && silent;

        vizFrameRef.current += 1;
        if (vizFrameRef.current % 2 === 0) {
          const history = levelsRef.current;
          const padded =
            history.length >= LEVEL_HISTORY
              ? history.slice(-LEVEL_HISTORY)
              : [...Array(LEVEL_HISTORY - history.length).fill(0), ...history];
          setAudioLevels(padded);
          setIsSilent(silentNow);
        }

        if (elapsed < LISTEN_GRACE_MS) {
          silenceStartRef.current = null;
        } else if (silent) {
          if (silenceStartRef.current === null) {
            silenceStartRef.current = Date.now();
          } else if (
            elapsed >= MIN_RECORD_MS &&
            Date.now() - silenceStartRef.current >= SILENCE_MS
          ) {
            if (rafRef.current) {
              cancelAnimationFrame(rafRef.current);
              rafRef.current = null;
            }
            if (recorderRef.current?.state === "recording") {
              recorderRef.current.stop();
            }
            return;
          }
        } else {
          silenceStartRef.current = null;
        }

        if (elapsed >= MAX_RECORD_MS) {
          if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
          }
          if (recorderRef.current?.state === "recording") {
            recorderRef.current.stop();
          }
          return;
        }

        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      setError(
        err.name === "NotAllowedError"
          ? "Microphone permission denied"
          : err.message || "Microphone unavailable"
      );
      setPhase("mic_paused");
    }
  }, [cleanupMic]);

  startListeningRef.current = startListening;

  const processUtteranceRef = useRef(null);

  const processUtterance = useCallback(
    async (blob, mimeType) => {
      if (!activeRef.current) return;

      setTranscript("");
      setLastAnswer("");
      setPhase("processing");
      setError(null);

      const ext = mimeType?.includes("wav")
        ? "wav"
        : mimeType?.includes("ogg")
          ? "ogg"
          : "webm";
      const form = new FormData();
      form.append("audio", blob, `utterance.${ext}`);

      let question = "";
      try {
        const tr = await fetch("/api/voice/transcribe", {
          method: "POST",
          body: form,
        });
        const trData = await tr.json();
        if (!tr.ok) throw new Error(trData.detail || "Transcription failed");
        question = (trData.text || "").trim();
        setTranscript(question);
      } catch (err) {
        setError(err.message);
        if (activeRef.current && micEnabledRef.current) {
          await startListening();
        } else if (activeRef.current) {
          setPhase("mic_paused");
        }
        return;
      }

      if (!question) {
        if (activeRef.current && micEnabledRef.current) {
          await startListening();
        } else if (activeRef.current) {
          setPhase("mic_paused");
        }
        return;
      }

      try {
        const askRes = await fetch("/api/friday/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, voice: true }),
        });
        const askData = await askRes.json();
        if (!askRes.ok) throw new Error(askData.detail || "Friday ask failed");

        setLastAnswer(askData.answer || "");
        const spoken = askData.spoken_text || askData.answer || "";

        if (!activeRef.current) return;

        await speakText(spoken);

        if (askData.open_world_monitor) {
          window.open(WORLD_MONITOR_URL, "_blank", "noopener,noreferrer");
        }

        if (!activeRef.current) return;

        if (micEnabledRef.current) {
          await startListening();
        } else {
          setPhase("mic_paused");
        }
      } catch (err) {
        setError(err.message);
        if (activeRef.current && micEnabledRef.current) {
          await startListening();
        } else if (activeRef.current) {
          setPhase("mic_paused");
        }
      }
    },
    [speakText, startListening]
  );

  processUtteranceRef.current = processUtterance;

  const playGreeting = useCallback(async () => {
    if (greetedRef.current) return;
    greetedRef.current = true;
    setPhase("processing");

    try {
      const res = await fetch("/api/friday/greeting");
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Greeting failed");
      const text = data.greeting || "";
      setGreeting(text);
      if (text && activeRef.current) {
        await speakText(text);
      }
    } catch (err) {
      setError(err.message);
    }

    if (activeRef.current && micEnabledRef.current) {
      await startListening();
    } else if (activeRef.current) {
      setPhase("mic_paused");
    }
  }, [speakText, startListening]);

  const startSession = useCallback(async () => {
    if (activeRef.current) return;

    setError(null);
    setPhase("starting");

    let ready = voiceReady === true;
    if (!ready) {
      ready = await checkVoiceStatus();
    }
    if (!ready) {
      setPhase("idle");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Microphone API not available in this browser");
      setPhase("idle");
      return;
    }

    activeRef.current = true;
    setMicEnabled(true);
    micEnabledRef.current = true;
    await playGreeting();
  }, [checkVoiceStatus, playGreeting, voiceReady]);

  const stopSession = useCallback(() => {
    activeRef.current = false;
    greetedRef.current = false;
    stopPlayback();
    cleanupMic();
    setPhase("idle");
    setMicEnabled(true);
    setTranscript("");
    setLastAnswer("");
    setGreeting("");
  }, [cleanupMic, stopPlayback]);

  const toggleMic = useCallback(async () => {
    if (!activeRef.current) {
      await startSession();
      return;
    }

    if (micEnabledRef.current) {
      micEnabledRef.current = false;
      setMicEnabled(false);
      cleanupMic();
      if (phaseRef.current !== "speaking" && phaseRef.current !== "processing") {
        setPhase("mic_paused");
      }
    } else {
      micEnabledRef.current = true;
      setMicEnabled(true);
      if (phaseRef.current !== "speaking" && phaseRef.current !== "processing") {
        await startListening();
      }
    }
  }, [cleanupMic, startListening, startSession]);

  useEffect(() => {
    checkVoiceStatus();
  }, [checkVoiceStatus]);

  useEffect(() => {
    return () => {
      activeRef.current = false;
      stopPlayback();
      cleanupMic();
    };
  }, [cleanupMic, stopPlayback]);

  return {
    phase,
    micEnabled,
    transcript,
    lastAnswer,
    greeting,
    error,
    voiceReady,
    audioLevels,
    isSilent,
    startSession,
    stopSession,
    toggleMic,
    checkVoiceStatus,
  };
}
