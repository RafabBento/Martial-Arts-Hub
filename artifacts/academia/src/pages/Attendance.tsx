import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  useListSessions, getListSessionsQueryKey,
  useListStudents, getListStudentsQueryKey,
  useListUsers, getListUsersQueryKey,
  useCreateSession,
  useCreateAttendance, useListAttendance, getListAttendanceQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, CheckCircle, XCircle, Loader2, UserCheck, ScanFace, Users, Zap, ImagePlus, CalendarCheck, Clock, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "../contexts/AuthContext";

type ModelStatus = "idle" | "loading" | "ready" | "error";
type ScanStatus = "idle" | "scanning" | "found" | "notfound";

// ---------- Cronograma semanal ----------
// days: 0=Dom 1=Seg 2=Ter 3=Qua 4=Qui 5=Sex 6=Sáb
const WEEKLY_SCHEDULE = [
  { days: [1,2,3,4,5], hour: 19, minute: 0,  modality: "jiu"  as const, instructorKey: "Ewerton"  },
  { days: [1,3,5],      hour: 20, minute: 30, modality: "thai" as const, instructorKey: "Ewerton"  },
  { days: [2,4],        hour: 20, minute: 30, modality: "thai" as const, instructorKey: "Luis"     },
  { days: [6],          hour: 10, minute: 30, modality: "thai" as const, instructorKey: "Nilberto" },
];

function detectCurrentClass(now = new Date()) {
  const day   = now.getDay();
  const total = now.getHours() * 60 + now.getMinutes();
  for (const entry of WEEKLY_SCHEDULE) {
    if (entry.days.includes(day)) {
      const start = entry.hour * 60 + entry.minute;
      if (total >= start - 30 && total <= start + 90) return entry;
    }
  }
  return null;
}

function isToday(date: Date) {
  const t = new Date();
  return date.getFullYear() === t.getFullYear()
      && date.getMonth()    === t.getMonth()
      && date.getDate()     === t.getDate();
}

function fmtTime(hour: number, minute: number) {
  return `${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`;
}

interface IdentifyMatch {
  studentId: number;
  name: string;
  profilePhotoUrl: string | null;
  distance: number;
  matched: boolean;
}

const MODEL_BASE = "https://vladmandic.github.io/face-api/model";

async function loadFaceApi() {
  const faceapi = await import("face-api.js");
  await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_BASE);
  await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_BASE);
  await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_BASE);
  return faceapi;
}

export default function Attendance() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  // Bloquear acesso de alunos
  const isMaster = user?.role === "teacher" || user?.role === "admin";

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const faceApiRef = useRef<Awaited<ReturnType<typeof loadFaceApi>> | null>(null);

  const [modelStatus, setModelStatus] = useState<ModelStatus>("idle");
  const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");
  const [cameraOn, setCameraOn] = useState(false);
  const [selectedSession, setSelectedSession] = useState("");
  const [matches, setMatches] = useState<IdentifyMatch[]>([]);
  const [unmatchedCount, setUnmatchedCount] = useState(0);
  const [confirmedIds, setConfirmedIds] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<"face" | "gallery" | "manual">("gallery");
  const [manualStudent, setManualStudent] = useState("");
  const [galleryScanning, setGalleryScanning] = useState(false);
  const [galleryPreviewUrl, setGalleryPreviewUrl] = useState<string | null>(null);
  const [registeringAll, setRegisteringAll] = useState(false);
  const [autoCreating, setAutoCreating] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const { data: sessions } = useListSessions(
    { modality: undefined },
    { query: { queryKey: getListSessionsQueryKey() } }
  );

  const { data: teachers } = useListUsers(
    { role: "teacher" },
    { query: { queryKey: getListUsersQueryKey({ role: "teacher" }) } }
  );

  const createSessionMutation = useCreateSession();

  // ---- Detecção inteligente da aula atual ----
  const currentClass = detectCurrentClass();

  const currentTeacher = currentClass && teachers
    ? teachers.find(t => t.name.toLowerCase().includes(currentClass.instructorKey.toLowerCase()))
    : null;

  const todaySession = currentClass && sessions
    ? sessions.find(s =>
        s.modality === currentClass.modality &&
        isToday(new Date(s.sessionDate))
      )
    : null;

  // Auto-seleciona sessão de hoje quando carregada
  useEffect(() => {
    if (todaySession && !selectedSession) {
      setSelectedSession(String(todaySession.id));
    }
  }, [todaySession, selectedSession]);

  const handleAutoSession = async () => {
    if (!currentClass) return;
    if (todaySession) {
      setSelectedSession(String(todaySession.id));
      toast({ title: "Sessão de hoje selecionada!" });
      return;
    }
    if (!currentTeacher) {
      toast({ title: "Instrutor não encontrado no sistema. Cadastre-o primeiro.", variant: "destructive" });
      return;
    }
    setAutoCreating(true);
    const now = new Date();
    const sessionDate = new Date(
      now.getFullYear(), now.getMonth(), now.getDate(),
      currentClass.hour, currentClass.minute, 0
    );
    createSessionMutation.mutate(
      {
        data: {
          modality: currentClass.modality,
          sessionDate: sessionDate.toISOString(),
          teacherId: currentTeacher.id,
          description: undefined,
        },
      },
      {
        onSuccess: (created) => {
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          setSelectedSession(String(created.id));
          toast({ title: "Sessão criada e selecionada automaticamente!" });
          setAutoCreating(false);
        },
        onError: () => {
          toast({ title: "Erro ao criar sessão automática", variant: "destructive" });
          setAutoCreating(false);
        },
      }
    );
  };

  const { data: students } = useListStudents(
    {},
    { query: { queryKey: getListStudentsQueryKey() } }
  );

  const { data: attendance, refetch: refetchAttendance } = useListAttendance(
    { sessionId: selectedSession ? parseInt(selectedSession, 10) : undefined },
    { query: { enabled: !!selectedSession, queryKey: getListAttendanceQueryKey({ sessionId: selectedSession ? parseInt(selectedSession, 10) : undefined }) } }
  );

  const createAttMutation = useCreateAttendance();

  const loadModels = useCallback(async () => {
    if (modelStatus === "ready" || modelStatus === "loading") return;
    setModelStatus("loading");
    try {
      faceApiRef.current = await loadFaceApi();
      setModelStatus("ready");
    } catch (e) {
      setModelStatus("error");
      toast({ title: "Erro ao carregar modelos de rosto", variant: "destructive" });
    }
  }, [modelStatus]);

  const startCamera = useCallback(async () => {
    await loadModels();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraOn(true);
    } catch {
      toast({ title: "Nao foi possivel acessar a camera", variant: "destructive" });
    }
  }, [loadModels]);

  const stopCamera = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
    setScanStatus("idle");
    setMatches([]);
  }, []);

  useEffect(() => {
    return () => { stopCamera(); };
  }, [stopCamera]);

  const scanFaces = useCallback(async () => {
    const faceapi = faceApiRef.current;
    if (!faceapi || !videoRef.current || !canvasRef.current) return;
    if (scanStatus === "scanning") return;

    setScanStatus("scanning");
    try {
      const detections = await faceapi
        .detectAllFaces(videoRef.current, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptors();

      if (detections.length === 0) {
        setScanStatus("idle");
        return;
      }

      const descriptors = detections.map(d => Array.from(d.descriptor));

      const resp = await fetch("/api/face/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ descriptors }),
      });

      if (!resp.ok) throw new Error("Identify failed");

      const result: IdentifyMatch[] = await resp.json();
      const found = result.filter(r => r.matched);

      if (found.length > 0) {
        setMatches(found);
        setScanStatus("found");
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } else {
        setScanStatus("notfound");
        setTimeout(() => setScanStatus("idle"), 2000);
      }
    } catch {
      setScanStatus("idle");
    }
  }, [scanStatus]);

  const startContinuousScan = useCallback(() => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(scanFaces, 3000);
  }, [scanFaces]);

  const stopContinuousScan = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setScanStatus("idle");
    setMatches([]);
  }, []);

  const confirmAttendance = (studentId: number, faceRecognized: boolean) => {
    if (!selectedSession) {
      toast({ title: "Selecione uma sessao primeiro", variant: "destructive" });
      return;
    }
    if (confirmedIds.has(studentId)) {
      toast({ title: "Presenca ja registrada para este aluno" });
      return;
    }
    createAttMutation.mutate(
      {
        data: {
          sessionId: parseInt(selectedSession, 10),
          studentId,
          faceRecognized,
        }
      },
      {
        onSuccess: () => {
          setConfirmedIds(prev => new Set([...prev, studentId]));
          queryClient.invalidateQueries({ queryKey: getListAttendanceQueryKey({ sessionId: parseInt(selectedSession, 10) }) });
          toast({ title: `Presenca confirmada!` });
          setMatches([]);
          setScanStatus("idle");
          if (mode === "face" && cameraOn) startContinuousScan();
        },
        onError: (e: any) => {
          toast({ title: e?.data?.error ?? "Erro ao registrar presenca", variant: "destructive" });
        }
      }
    );
  };

  const handleManualAdd = () => {
    if (!manualStudent) {
      toast({ title: "Selecione um aluno", variant: "destructive" });
      return;
    }
    confirmAttendance(parseInt(manualStudent, 10), false);
    setManualStudent("");
  };

  const handleGalleryScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!selectedSession) {
      toast({ title: "Selecione uma sessão primeiro", variant: "destructive" });
      return;
    }
    setGalleryScanning(true);
    setMatches([]);
    setUnmatchedCount(0);
    setScanStatus("scanning");

    // Preview da foto
    const previewUrl = URL.createObjectURL(file);
    setGalleryPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return previewUrl; });

    try {
      if (!faceApiRef.current) {
        faceApiRef.current = await loadFaceApi();
      }
      const faceapi = faceApiRef.current;
      const img = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      const detections = await faceapi
        .detectAllFaces(canvas as unknown as HTMLCanvasElement, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 }))
        .withFaceLandmarks()
        .withFaceDescriptors();
      if (detections.length === 0) {
        setScanStatus("notfound");
        toast({ title: "Nenhum rosto detectado na foto", variant: "destructive" });
        setTimeout(() => setScanStatus("idle"), 2000);
        return;
      }
      const descriptors = detections.map(d => Array.from(d.descriptor));
      const resp = await fetch("/api/face/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ descriptors }),
      });
      if (!resp.ok) throw new Error("Identify failed");
      const result: IdentifyMatch[] = await resp.json();

      // Deduplicar: para cada aluno, manter apenas o match com menor distância
      const matchMap = new Map<number, IdentifyMatch>();
      for (const r of result) {
        if (!r.matched) continue;
        const existing = matchMap.get(r.studentId);
        if (!existing || r.distance < existing.distance) {
          matchMap.set(r.studentId, r);
        }
      }
      const found = Array.from(matchMap.values());
      const unmatched = descriptors.length - result.filter(r => r.matched).length;
      setUnmatchedCount(Math.max(0, unmatched));

      if (found.length > 0) {
        setMatches(found);
        setScanStatus("found");
      } else {
        setScanStatus("notfound");
        toast({ title: "Nenhum aluno identificado na foto", variant: "destructive" });
        setTimeout(() => setScanStatus("idle"), 2000);
      }
    } catch {
      setScanStatus("idle");
      toast({ title: "Erro ao processar a foto", variant: "destructive" });
    } finally {
      setGalleryScanning(false);
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }
  };

  const handleRegisterAll = async () => {
    if (!selectedSession) return;
    const toRegister = matches.filter(m => !attendedIds.has(m.studentId) && !confirmedIds.has(m.studentId));
    if (toRegister.length === 0) {
      toast({ title: "Todos já estão registrados!" });
      return;
    }
    setRegisteringAll(true);
    let count = 0;
    for (const m of toRegister) {
      await new Promise<void>((resolve) => {
        createAttMutation.mutate(
          { data: { sessionId: parseInt(selectedSession, 10), studentId: m.studentId, faceRecognized: true } },
          {
            onSuccess: () => {
              setConfirmedIds(prev => new Set([...prev, m.studentId]));
              count++;
              resolve();
            },
            onError: () => resolve(),
          }
        );
      });
    }
    await queryClient.invalidateQueries({ queryKey: getListAttendanceQueryKey({ sessionId: parseInt(selectedSession, 10) }) });
    toast({ title: `${count} presença${count !== 1 ? "s" : ""} registrada${count !== 1 ? "s" : ""} com sucesso!` });
    setRegisteringAll(false);
  };

  const attendedIds = new Set(attendance?.map(a => a.studentId) ?? []);

  if (!isMaster) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <ShieldAlert size={32} className="text-primary" />
        </div>
        <h2 className="text-2xl font-black uppercase">Acesso restrito</h2>
        <p className="text-muted-foreground max-w-sm">
          O controle de presenças é exclusivo para professores e administradores.
          Consulte seu professor para ver seu histórico.
        </p>
        <Button variant="outline" onClick={() => setLocation("/dashboard")}>Voltar ao Painel</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-black tracking-tight uppercase">Controle de Presença</h1>
        <p className="text-muted-foreground mt-1">Envie a foto pós-treino para registrar presenças automaticamente por reconhecimento facial</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">

          {/* Banner inteligente de aula atual */}
          {currentClass ? (
            <div className={`rounded-xl border p-4 flex items-center gap-4 ${
              todaySession
                ? "bg-green-500/10 border-green-500/30"
                : "bg-primary/10 border-primary/30"
            }`}>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                todaySession ? "bg-green-500/20" : "bg-primary/20"
              }`}>
                {todaySession ? <CalendarCheck size={20} className="text-green-400" /> : <Clock size={20} className="text-primary" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm">
                  {currentClass.modality === "thai" ? "Muay Thai" : "Jiu-Jitsu"} — {fmtTime(currentClass.hour, currentClass.minute)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {currentTeacher ? currentTeacher.name : `Instrutor: ${currentClass.instructorKey}`}
                  {todaySession ? " · Sessão já aberta" : " · Nenhuma sessão criada hoje"}
                </div>
              </div>
              <Button
                size="sm"
                variant={todaySession ? "outline" : "default"}
                disabled={autoCreating}
                onClick={handleAutoSession}
              >
                {autoCreating
                  ? <><Loader2 size={13} className="animate-spin mr-1" />Criando...</>
                  : todaySession
                    ? <><CalendarCheck size={13} className="mr-1" />Selecionar</>
                    : <><Zap size={13} className="mr-1" />Abrir aula</>
                }
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-muted/30 p-3 flex items-center gap-3 text-muted-foreground text-sm">
              <Clock size={16} />
              <span>Nenhuma aula no cronograma para este horário</span>
            </div>
          )}

          <div className="bg-card border border-border rounded-lg p-4">
            <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide block mb-2">Sessão de Treino</label>
            <Select value={selectedSession} onValueChange={setSelectedSession} data-testid="select-session">
              <SelectTrigger data-testid="select-session-trigger">
                <SelectValue placeholder="Selecione a sessao..." />
              </SelectTrigger>
              <SelectContent>
                {sessions?.map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    <span className={`font-bold mr-2 ${s.modality === "thai" ? "text-red-400" : "text-blue-400"}`}>
                      {s.modality === "thai" ? "[MT]" : "[JJ]"}
                    </span>
                    {new Date(s.sessionDate).toLocaleString("pt-BR")} — {s.description ?? "Treino"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button
              data-testid="button-mode-face"
              variant={mode === "face" ? "default" : "outline"}
              onClick={() => { setMode("face"); stopContinuousScan(); setMatches([]); setScanStatus("idle"); }}
            >
              <ScanFace size={16} className="mr-2" /> Câmera
            </Button>
            <Button
              data-testid="button-mode-gallery"
              variant={mode === "gallery" ? "default" : "outline"}
              onClick={() => { setMode("gallery"); stopCamera(); setMatches([]); setScanStatus("idle"); }}
            >
              <ImagePlus size={16} className="mr-2" /> Galeria
            </Button>
            <Button
              data-testid="button-mode-manual"
              variant={mode === "manual" ? "default" : "outline"}
              onClick={() => { setMode("manual"); stopCamera(); setMatches([]); setScanStatus("idle"); }}
            >
              <Users size={16} className="mr-2" /> Manual
            </Button>
          </div>

          {mode === "face" && (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="relative aspect-video bg-black flex items-center justify-center">
                <video
                  ref={videoRef}
                  data-testid="video-camera"
                  className={`w-full h-full object-cover ${cameraOn ? "block" : "hidden"}`}
                  muted
                  playsInline
                />
                <canvas ref={canvasRef} className="hidden" />
                {!cameraOn && (
                  <div className="text-center space-y-3">
                    <Camera size={48} className="text-muted-foreground mx-auto" />
                    <div className="text-muted-foreground text-sm">Camera desligada</div>
                  </div>
                )}

                {cameraOn && (
                  <div className={`absolute inset-0 border-4 pointer-events-none transition-colors ${
                    scanStatus === "found" ? "border-green-400" :
                    scanStatus === "notfound" ? "border-red-500/60" :
                    scanStatus === "scanning" ? "border-primary/60" :
                    "border-transparent"
                  }`} />
                )}
              </div>

              <div className="p-4 space-y-3">
                {modelStatus === "loading" && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 size={14} className="animate-spin" />
                    Carregando modelos de reconhecimento facial...
                  </div>
                )}
                {modelStatus === "error" && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <XCircle size={14} />
                    Falha ao carregar modelos
                  </div>
                )}

                <div className="flex gap-2 flex-wrap">
                  {!cameraOn ? (
                    <Button data-testid="button-start-camera" onClick={startCamera} disabled={modelStatus === "loading"}>
                      {modelStatus === "loading" ? <><Loader2 size={14} className="animate-spin mr-2" />Carregando...</> : <><Camera size={14} className="mr-2" />Ligar Camera</>}
                    </Button>
                  ) : (
                    <>
                      <Button data-testid="button-stop-camera" variant="outline" onClick={stopCamera}>
                        Desligar Camera
                      </Button>
                      {!intervalRef.current ? (
                        <Button data-testid="button-start-scan" onClick={() => { startContinuousScan(); scanFaces(); }} disabled={!selectedSession}>
                          <Zap size={14} className="mr-2" /> Iniciar Varredura
                        </Button>
                      ) : (
                        <Button data-testid="button-stop-scan" variant="outline" onClick={stopContinuousScan}>
                          Parar Varredura
                        </Button>
                      )}
                      <Button data-testid="button-scan-once" variant="outline" onClick={scanFaces} disabled={scanStatus === "scanning" || !selectedSession}>
                        {scanStatus === "scanning" ? <Loader2 size={14} className="animate-spin mr-2" /> : <ScanFace size={14} className="mr-2" />}
                        Escanear
                      </Button>
                    </>
                  )}
                </div>

                {scanStatus === "scanning" && (
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" /> Analisando rosto...
                  </div>
                )}

                {scanStatus === "notfound" && (
                  <div className="flex items-center gap-2 text-sm text-red-400">
                    <XCircle size={14} /> Rosto nao identificado na base
                  </div>
                )}

                {matches.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-green-400 flex items-center gap-2">
                      <CheckCircle size={14} /> {matches.length} rosto{matches.length > 1 ? "s" : ""} identificado{matches.length > 1 ? "s" : ""}
                    </div>
                    {matches.map(m => (
                      <div key={m.studentId} data-testid={`match-${m.studentId}`} className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                        <div className="w-10 h-10 rounded-full bg-muted border border-border overflow-hidden shrink-0">
                          {m.profilePhotoUrl
                            ? <img src={m.profilePhotoUrl} alt={m.name} className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center text-sm font-bold">{m.name.charAt(0)}</div>
                          }
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold">{m.name}</div>
                          <div className="text-xs text-muted-foreground">Dist: {m.distance.toFixed(3)}</div>
                        </div>
                        {attendedIds.has(m.studentId) || confirmedIds.has(m.studentId) ? (
                          <span className="text-xs text-green-400 font-bold">Ja registrado</span>
                        ) : (
                          <Button
                            data-testid={`button-confirm-${m.studentId}`}
                            size="sm"
                            onClick={() => confirmAttendance(m.studentId, true)}
                            disabled={createAttMutation.isPending}
                          >
                            <UserCheck size={14} className="mr-1" /> Confirmar
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {mode === "gallery" && (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              {/* Preview da foto */}
              {galleryPreviewUrl && (
                <div className="relative">
                  <img
                    src={galleryPreviewUrl}
                    alt="Foto pós-treino"
                    className="w-full max-h-72 object-cover"
                  />
                  {galleryScanning && (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3">
                      <Loader2 size={36} className="animate-spin text-primary" />
                      <span className="text-sm font-semibold text-white">Analisando rostos...</span>
                    </div>
                  )}
                  {matches.length > 0 && !galleryScanning && (
                    <div className="absolute top-3 left-3 bg-black/70 text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5">
                      <CheckCircle size={13} className="text-green-400" />
                      {matches.length} identificado{matches.length !== 1 ? "s" : ""}
                      {unmatchedCount > 0 && <span className="text-muted-foreground"> · {unmatchedCount} não reconhecido{unmatchedCount !== 1 ? "s" : ""}</span>}
                    </div>
                  )}
                </div>
              )}

              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-sm uppercase tracking-wide">Foto Pós-Treino</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Envie a foto do grupo para registrar as presenças automaticamente</p>
                  </div>
                </div>

                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleGalleryScan}
                />
                <Button
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={galleryScanning || !selectedSession}
                  className="w-full"
                  size="lg"
                >
                  {galleryScanning
                    ? <><Loader2 size={16} className="animate-spin mr-2" />Analisando foto...</>
                    : <><ImagePlus size={16} className="mr-2" />{galleryPreviewUrl ? "Trocar foto" : "Enviar foto do grupo"}</>
                  }
                </Button>

                {!selectedSession && (
                  <p className="text-xs text-primary text-center">⚠ Selecione uma sessão de treino antes de enviar a foto</p>
                )}

                {scanStatus === "notfound" && (
                  <div className="flex items-center gap-2 text-sm text-red-400">
                    <XCircle size={14} /> Nenhum aluno identificado — certifique-se que os rostos estão cadastrados no sistema
                  </div>
                )}

                {matches.length > 0 && (
                  <div className="space-y-3">
                    {/* Botão registrar todos */}
                    {matches.some(m => !attendedIds.has(m.studentId) && !confirmedIds.has(m.studentId)) && (
                      <Button
                        className="w-full"
                        onClick={handleRegisterAll}
                        disabled={registeringAll || !selectedSession}
                      >
                        {registeringAll
                          ? <><Loader2 size={16} className="animate-spin mr-2" />Registrando...</>
                          : <><UserCheck size={16} className="mr-2" />Registrar {matches.filter(m => !attendedIds.has(m.studentId) && !confirmedIds.has(m.studentId)).length} presença{matches.filter(m => !attendedIds.has(m.studentId) && !confirmedIds.has(m.studentId)).length !== 1 ? "s" : ""}</>
                        }
                      </Button>
                    )}

                    <div className="space-y-2">
                      {matches.map(m => {
                        const alreadyIn = attendedIds.has(m.studentId) || confirmedIds.has(m.studentId);
                        return (
                          <div key={m.studentId} className={`flex items-center gap-3 p-3 rounded-lg border ${alreadyIn ? "bg-green-500/10 border-green-500/30" : "bg-muted/40 border-border"}`}>
                            <div className="w-10 h-10 rounded-full bg-muted border border-border overflow-hidden shrink-0">
                              {m.profilePhotoUrl
                                ? <img src={m.profilePhotoUrl} alt={m.name} className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center text-sm font-bold">{m.name.charAt(0)}</div>
                              }
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-sm">{m.name}</div>
                              <div className="text-xs text-muted-foreground">Confiança: {((1 - m.distance) * 100).toFixed(0)}%</div>
                            </div>
                            {alreadyIn
                              ? <CheckCircle size={18} className="text-green-400 shrink-0" />
                              : <div className="w-2 h-2 rounded-full bg-muted-foreground/40 shrink-0" />
                            }
                          </div>
                        );
                      })}
                    </div>

                    {unmatchedCount > 0 && (
                      <p className="text-xs text-muted-foreground text-center">
                        {unmatchedCount} rosto{unmatchedCount !== 1 ? "s" : ""} não identificado{unmatchedCount !== 1 ? "s" : ""} — adicione a foto de perfil desses alunos no sistema
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {mode === "manual" && (
            <div className="bg-card border border-border rounded-lg p-5 space-y-4">
              <h3 className="font-bold text-sm uppercase tracking-wide text-muted-foreground">Adicionar Presenca Manualmente</h3>
              <div className="flex gap-3">
                <Select value={manualStudent} onValueChange={setManualStudent}>
                  <SelectTrigger data-testid="select-manual-student" className="flex-1">
                    <SelectValue placeholder="Selecionar aluno..." />
                  </SelectTrigger>
                  <SelectContent>
                    {students?.map(s => (
                      <SelectItem key={s.userId} value={String(s.userId)}>
                        {s.name}
                        {(attendedIds.has(s.userId) || confirmedIds.has(s.userId)) && " ✓"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  data-testid="button-manual-add"
                  onClick={handleManualAdd}
                  disabled={!manualStudent || !selectedSession || createAttMutation.isPending}
                >
                  <UserCheck size={14} className="mr-2" /> Adicionar
                </Button>
              </div>

              <div className="space-y-2">
                {students?.filter(s => attendedIds.has(s.userId) || confirmedIds.has(s.userId)).map(s => (
                  <div key={s.userId} className="flex items-center gap-2 text-sm text-green-400">
                    <CheckCircle size={14} /> {s.name}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4">
            <UserCheck size={18} className="text-primary" />
            <h2 className="font-bold uppercase tracking-wide text-sm">Presentes Hoje</h2>
            <span className="ml-auto text-sm font-bold text-primary">{attendance?.length ?? 0}</span>
          </div>
          {!selectedSession ? (
            <div className="text-center py-8 text-muted-foreground text-xs">Selecione uma sessao</div>
          ) : attendance && attendance.length > 0 ? (
            <div className="space-y-2 max-h-[480px] overflow-y-auto">
              {attendance.map(rec => (
                <div key={rec.id} data-testid={`att-confirmed-${rec.studentId}`} className="flex items-center gap-2 py-2 border-b border-border/50 last:border-0">
                  <div className="w-8 h-8 rounded-full bg-muted border border-border overflow-hidden shrink-0">
                    {rec.studentPhotoUrl
                      ? <img src={rec.studentPhotoUrl} alt={rec.studentName} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-muted-foreground">{rec.studentName.charAt(0)}</div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{rec.studentName}</div>
                    {rec.faceRecognized && <div className="text-xs text-green-400">Facial</div>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-xs">Nenhuma presenca ainda</div>
          )}
        </div>
      </div>
    </div>
  );
}
