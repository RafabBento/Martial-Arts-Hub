import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useUpdateUser, useListAttendance, getListAttendanceQueryKey, getListUsersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { User, Camera, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

import logoThai from "/logo-thai.png";
import logoJiu from "/logo-jiu.png";

type Modality = "thai" | "jiu";

export default function Profile() {
  const { user, setUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [modality, setModality] = useState<Modality>("thai");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateMutation = useUpdateUser();

  const { data: attendance } = useListAttendance(
    { studentId: user?.id, modality },
    {
      query: {
        enabled: !!user?.id && user.role === "student",
        queryKey: getListAttendanceQueryKey({ studentId: user?.id, modality }),
      },
    }
  );

  const handleSave = () => {
    if (!user) return;
    updateMutation.mutate(
      { id: user.id, data: { name: name || undefined, phone: phone || undefined } },
      {
        onSuccess: (updated) => {
          setUser(updated);
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          setEditing(false);
          toast({ title: "Perfil atualizado com sucesso" });
        },
        onError: () => toast({ title: "Erro ao atualizar perfil", variant: "destructive" }),
      }
    );
  };

  if (!user) return null;

  const rolePt =
    user.role === "admin" ? "Administrador" : user.role === "teacher" ? "Professor" : "Aluno";

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Logos das equipes */}
      <div className="flex items-center justify-center">
        <img
          src={logoThai}
          alt="Front Artes Marciais"
          className="object-contain"
          style={{ width: 300, height: 300 }}
        />
        {modality === "jiu" && (
          <img
            src={logoJiu}
            alt="Bollacha Wrestling BJJ"
            className="object-contain"
            style={{ width: 300, height: 300, marginLeft: -80 }}
          />
        )}
      </div>

      {/* Título e toggle */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase">Meu Perfil</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">Gerencie suas informações pessoais</p>
        </div>

        {/* Toggle de modalidade */}
        <div className="flex gap-2 bg-card border border-border rounded-lg p-1 shrink-0">
          <Button
            data-testid="button-profile-thai"
            variant={modality === "thai" ? "default" : "ghost"}
            size="sm"
            onClick={() => setModality("thai")}
          >
            Muay Thai
          </Button>
          <Button
            data-testid="button-profile-jiu"
            variant={modality === "jiu" ? "default" : "ghost"}
            size="sm"
            onClick={() => setModality("jiu")}
          >
            Jiu-Jitsu
          </Button>
        </div>
      </div>

      {/* Dados do perfil */}
      <div className="bg-card border border-border rounded-lg p-6 space-y-6">
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 rounded-full bg-muted border-2 border-border overflow-hidden shrink-0">
            {user.profilePhotoUrl ? (
              <img
                src={user.profilePhotoUrl}
                alt={user.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl font-black text-muted-foreground">
                {user.name.charAt(0)}
              </div>
            )}
          </div>
          <div>
            <div className="text-2xl font-bold">{user.name}</div>
            <div className="text-sm text-muted-foreground">{user.email}</div>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`inline-block px-3 py-0.5 rounded-full text-xs font-bold ${
                  user.role === "admin"
                    ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                    : user.role === "teacher"
                    ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                    : "bg-primary/20 text-primary border border-primary/30"
                }`}
              >
                {rolePt}
              </span>
              <span
                className={`inline-block px-3 py-0.5 rounded-full text-xs font-bold ${
                  modality === "thai"
                    ? "bg-red-500/20 text-red-400 border border-red-500/30"
                    : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                }`}
              >
                {modality === "thai" ? "MUAY THAI" : "JIU-JITSU"}
              </span>
            </div>
          </div>
        </div>

        {editing ? (
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Nome</label>
              <Input
                data-testid="input-profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Telefone</label>
              <Input
                data-testid="input-profile-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(11) 99999-0000"
              />
            </div>
            <div className="flex gap-3">
              <Button
                data-testid="button-save-profile"
                onClick={handleSave}
                disabled={updateMutation.isPending}
              >
                <Save size={16} className="mr-2" />
                {updateMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
              <Button variant="outline" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Nome</span>
              <span>{user.name}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Email</span>
              <span>{user.email}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Telefone</span>
              <span>{user.phone ?? "Não informado"}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Função</span>
              <span>{rolePt}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Membro desde</span>
              <span>{new Date(user.createdAt).toLocaleDateString("pt-BR")}</span>
            </div>
            <Button
              data-testid="button-edit-profile"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                setName(user.name);
                setPhone(user.phone ?? "");
                setEditing(true);
              }}
            >
              <User size={14} className="mr-2" /> Editar Perfil
            </Button>
          </div>
        )}
      </div>

      {/* Histórico de presenças — apenas alunos */}
      {user.role === "student" && (
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Camera size={18} className="text-primary" />
            <h2 className="font-bold text-lg uppercase tracking-wide">Histórico de Presenças</h2>
            <span
              className={`ml-2 text-xs font-bold px-2 py-0.5 rounded ${
                modality === "thai"
                  ? "bg-red-500/20 text-red-400"
                  : "bg-blue-500/20 text-blue-400"
              }`}
            >
              {modality === "thai" ? "Muay Thai" : "Jiu-Jitsu"}
            </span>
            <span className="ml-auto text-sm text-muted-foreground">
              {attendance?.length ?? 0} treinos
            </span>
          </div>
          {attendance && attendance.length > 0 ? (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {attendance.map((rec) => (
                <div
                  key={rec.id}
                  data-testid={`row-my-att-${rec.id}`}
                  className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0 text-sm"
                >
                  <div
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      rec.modality === "thai" ? "bg-red-400" : "bg-blue-400"
                    }`}
                  />
                  <span className="flex-1 text-muted-foreground">
                    {new Date(rec.createdAt).toLocaleDateString("pt-BR")}
                  </span>
                  {rec.faceRecognized && (
                    <span className="text-xs text-green-400">Reconhecido</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Nenhuma presença registrada em{" "}
              {modality === "thai" ? "Muay Thai" : "Jiu-Jitsu"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
