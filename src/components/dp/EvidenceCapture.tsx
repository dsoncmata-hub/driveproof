import { Camera as NativeCamera, CameraResultType, CameraSource } from "@capacitor/camera";
import { isNative } from "@/lib/dp/native";
import { scopeGeneration } from "@/lib/dp/accountScope";
import { useEffect, useRef, useState } from "react";
import { Camera, Check, ImageUp, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { registerEvidence } from "@/lib/dp/evidence";
import { LABELS } from "@/lib/dp/defaults";
import type { EvidenceCategory } from "@/lib/dp/types";

const CATEGORIES: EvidenceCategory[] = ["painel", "bomba", "pneus", "evento", "outro"];

export function EvidenceCapture({
  tripId = null,
  fuelingId = null,
  defaultCategory = "painel",
}: {
  tripId?: string | null;
  fuelingId?: string | null;
  defaultCategory?: EvidenceCategory;
}) {
  const [category, setCategory] = useState<EvidenceCategory>(defaultCategory);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | Blob, inApp: boolean, fileName?: string) {
    setBusy(true);
    try {
      const ev = await registerEvidence({
        file,
        fileName: fileName ?? (file instanceof File ? file.name : `${category}.jpg`),
        category,
        tripId,
        fuelingId,
        inAppCapture: inApp,
      });
      toast.success("Evidência registrada", {
        description: `SHA-256 ${ev.sha256.slice(0, 16)}… · ${LABELS.evidence[ev.category]}`,
      });
    } catch (e) {
      toast.error("Não foi possível registrar a evidência", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  async function openCamera() {
    if (!isNative()) {
      setCameraOpen(true);
      return;
    }
    const scope = scopeGeneration();
    setBusy(true);
    try {
      const photo = await NativeCamera.getPhoto({
        source: CameraSource.Camera,
        resultType: CameraResultType.Uri,
        quality: 100,
        allowEditing: false,
        saveToGallery: false,
      });
      if (!photo.webPath) throw Error("A câmera não retornou um arquivo.");
      const response = await fetch(photo.webPath);
      const blob = await response.blob();
      if (scope !== scopeGeneration())
        throw Error("A conta mudou durante a captura. Repita na conta correta.");
      await handleFile(blob, true, `${category}-${Date.now()}.${photo.format}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Captura não concluída.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`min-h-10 rounded-md border px-3 text-sm font-medium transition-colors ${
              category === c
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-secondary/40 text-muted-foreground"
            }`}
          >
            {LABELS.evidence[c]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button
          type="button"
          size="lg"
          className="min-h-14 w-full whitespace-normal break-words text-center"
          disabled={busy}
          onClick={() => void openCamera()}
        >
          <Camera className="size-5" /> Câmera do app
        </Button>
        <Button
          type="button"
          size="lg"
          variant="secondary"
          className="min-h-14 w-full whitespace-normal break-words text-center"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <ImageUp className="size-5" /> Arquivo / câmera do sistema
        </Button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f, false, f.name);
          e.target.value = "";
        }}
      />

      {cameraOpen ? (
        <CameraSheet
          onClose={() => setCameraOpen(false)}
          onShot={async (blob) => {
            setCameraOpen(false);
            await handleFile(blob, true, `${category}-${Date.now()}.jpg`);
          }}
        />
      ) : null}
    </div>
  );
}

function CameraSheet({
  onClose,
  onShot,
}: {
  onClose: () => void;
  onShot: (blob: Blob) => void | Promise<void>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setError(
          "A câmera interna não pôde ser aberta neste navegador. Use a opção 'Arquivo / câmera do sistema'.",
        );
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function shoot() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) void onShot(blob);
      },
      "image/jpeg",
      0.92,
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 p-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <p className="min-w-0 truncate text-sm text-white/80">Captura no app (com hash e GPS)</p>
        <Button size="icon" variant="secondary" className="shrink-0" onClick={onClose}>
          <X className="size-5" />
        </Button>
      </div>
      <div className="mt-3 flex-1 overflow-hidden rounded-lg bg-black">
        {error ? (
          <p className="p-6 text-center text-sm text-white/80">{error}</p>
        ) : (
          <video ref={videoRef} playsInline muted className="h-full w-full object-contain" />
        )}
      </div>
      <Button size="lg" className="mt-4 min-h-16 text-base" disabled={!!error} onClick={shoot}>
        <Check className="size-6" /> Capturar foto
      </Button>
    </div>
  );
}
