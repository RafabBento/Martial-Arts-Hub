// Tela de bloqueio para contas (novas ou já existentes, qualquer papel) que
// ainda não têm o rosto de referência cadastrado. O reconhecimento facial é
// obrigatório — usado para contabilizar presença automaticamente — então
// esta é a única tela que o usuário consegue ver até concluir o cadastro.
// Ver o gate em App.tsx (ProtectedRoute), que renderiza este componente no
// lugar de qualquer rota quando user.faceRegistered é false (depois do gate
// de termo de saúde, ver CompleteProfile.tsx).
import { useState } from "react";
import { useLogout } from "@workspace/api-client-react";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { ScanFace, LogOut } from "lucide-react";
import { FaceEnrollModal } from "../components/FaceEnrollModal";

export default function CompleteFaceEnrollment() {
  const { user, setUser } = useAuth();
  const [enrollOpen, setEnrollOpen] = useState(false);
  const logoutMutation = useLogout();

  const handleLogout = () => {
    logoutMutation.mutate(undefined, { onSuccess: () => setUser(null) });
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background dark text-foreground flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={handleLogout} disabled={logoutMutation.isPending}>
            <LogOut size={14} /> Sair
          </Button>
        </div>

        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <ScanFace size={30} className="text-primary" />
          </div>
          <h1 className="text-2xl font-black uppercase tracking-tighter">Falta o seu rosto, {user.name.split(" ")[0]}</h1>
          <p className="text-muted-foreground text-sm">
            O cadastro facial é obrigatório para todos — alunos, professores e administradores.
            É assim que a presença nos treinos é contabilizada automaticamente.
            Você não consegue usar o app até cadastrar seu rosto.
          </p>
        </div>

        <Button className="w-full h-12 gap-2" onClick={() => setEnrollOpen(true)}>
          <ScanFace size={18} /> Cadastrar rosto (vários ângulos)
        </Button>
      </div>

      <FaceEnrollModal
        open={enrollOpen}
        userId={user.id}
        title="Cadastro facial obrigatório"
        onClose={() => setEnrollOpen(false)}
        onDone={(result) => {
          if (result.anglesStored > 0) {
            setUser({ ...user, faceRegistered: true });
          }
        }}
      />
    </div>
  );
}
