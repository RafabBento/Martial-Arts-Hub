// Página inicial pública (landing page) da academia. Mostra o hero com chamadas
// para cadastro/login e o cronograma fixo de aulas. Não consome dados da API —
// é puramente estática e serve como porta de entrada para visitantes.
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { MapPin, Clock } from "lucide-react";

// Cronograma fixo de aulas exibido na seção "Cronograma" (apenas conteúdo
// estático para divulgação — não vem do banco de dados).
const SCHEDULE = [
  {
    time: "19:00",
    modality: "Jiu-Jitsu",
    days: "Segunda a Sexta",
    instructor: "Instrutor Ewerton",
    color: "blue" as const,
  },
  {
    time: "20:30",
    modality: "Muay Thai",
    days: "Segunda, Quarta e Sexta",
    instructor: "Mestre Ewerton",
    color: "red" as const,
  },
  {
    time: "20:30",
    modality: "Muay Thai",
    days: "Terça e Quinta",
    instructor: "Instrutor Luis",
    color: "red" as const,
  },
  {
    time: "10:30",
    modality: "Muay Thai",
    days: "Sábado",
    instructor: "Instrutor Nilberto",
    color: "red" as const,
  },
];

export default function Home() {
  return (
    <div className="bg-background dark text-foreground flex flex-col">
      {/* Hero: imagem de fundo + overlays de gradiente, título de impacto e
          botões de Cadastro/Login que levam às rotas correspondentes */}
      <main className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('/bg-home.png')] bg-cover bg-center opacity-80"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-zinc-900/70 to-black"></div>
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSIvPjwvc3ZnPg==')] opacity-30 pointer-events-none"></div>

        <div className="relative z-10 max-w-4xl mx-auto text-center space-y-8">
          <h1 className="text-6xl md:text-8xl font-black uppercase tracking-tighter leading-[0.9]">
            Disciplina <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-red-800">É Tudo</span>
          </h1>

          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto font-medium">
            A plataforma completa para academias de artes marciais. Controle de Muay Thai & Jiu-Jitsu, rankings e presença por reconhecimento facial.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
            <Link href="/register">
              <Button size="lg" className="w-full sm:w-auto h-14 px-8 text-lg font-bold uppercase tracking-wide">
                Cadastrar-se
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="w-full sm:w-auto h-14 px-8 text-lg font-bold uppercase tracking-wide border-2">
                Entrar
              </Button>
            </Link>
          </div>

          <p className="text-sm font-bold uppercase tracking-[0.3em] text-zinc-500 pt-4">Front Artes Marciais</p>
        </div>

        {/* Seta para baixo */}
        <a href="#cronograma" className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 animate-bounce text-zinc-500 hover:text-white transition-colors">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        </a>
      </main>

      {/* Cronograma: renderiza os cards de SCHEDULE com horário, modalidade,
          dias e instrutor; cores variam conforme a modalidade (azul/vermelho) */}
      <section id="cronograma" className="bg-zinc-950 py-20 px-4">
        <div className="max-w-4xl mx-auto space-y-10">
          <div className="text-center space-y-2">
            <h2 className="text-4xl font-black uppercase tracking-tighter">Cronograma de Aulas</h2>
            <div className="flex items-center justify-center gap-2 text-zinc-400 text-sm">
              <MapPin size={14} />
              <span>Av. Julio Buono, 2224</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {SCHEDULE.map((item, i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex gap-4 items-start hover:border-zinc-600 transition-colors">
                <div className="flex flex-col items-center justify-center bg-zinc-800 rounded-lg px-3 py-2 shrink-0 min-w-[64px]">
                  <Clock size={13} className="text-zinc-400 mb-0.5" />
                  <span className="text-lg font-black text-white leading-none">{item.time}</span>
                </div>
                <div className="space-y-1">
                  <span className={`inline-block text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${item.color === "blue" ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "bg-red-500/20 text-red-400 border border-red-500/30"}`}>
                    {item.modality}
                  </span>
                  <p className="font-semibold text-white text-sm">{item.days}</p>
                  <p className="text-zinc-400 text-sm">{item.instructor}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
