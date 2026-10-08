export type DeletionServices = {
  verify: (token: string) => Promise<{ id: string } | null>;
  request: (token: string) => Promise<void>;
  objects: (id: string) => Promise<{ bucket: string; name: string }[]>;
  remove: (bucket: string, names: string[]) => Promise<void>;
  purge: (id: string) => Promise<void>;
  revoke: (token: string) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
};
const allowedOrigins = new Set([
  "https://driveproof-taupe.vercel.app",
  "http://localhost",
  "https://localhost",
  "capacitor://localhost",
]);
export function deletionHandler(services: DeletionServices) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("Origin");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Vary: "Origin",
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    };
    if (origin && allowedOrigins.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
    const reply = (status: number, value: object) =>
      new Response(JSON.stringify(value), { status, headers });
    if (origin && !allowedOrigins.has(origin))
      return reply(403, { error: "Origem não autorizada." });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return reply(405, { error: "Método não permitido." });
    const authorization = request.headers.get("Authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) return reply(401, { error: "Entre novamente." });
    try {
      if (Number(request.headers.get("Content-Length") ?? 0) > 1024)
        return reply(413, { error: "Requisição inválida." });
      const body = await request.json();
      if (body?.confirmation !== "EXCLUIR" || Object.keys(body).some((k) => k !== "confirmation"))
        return reply(400, { error: "Confirme a exclusão da sua própria conta." });
      const token = authorization.slice(7),
        actor = await services.verify(token);
      if (!actor) return reply(401, { error: "Sessão não confirmada." });
      // The actor always comes from Auth; the caller never supplies a target ID.
      await services.request(token);
      for (let batch = 0; batch < 20; batch++) {
        const objects = await services.objects(actor.id);
        if (!objects.length) {
          await services.purge(actor.id);
          await services.revoke(token);
          await services.deleteUser(actor.id);
          return reply(200, { status: "deleted" });
        }
        for (const bucket of new Set(objects.map((o) => o.bucket))) {
          if (!["driveproof-evidence", "carvrum-tracks"].includes(bucket))
            throw Error("Inventário de exclusão inválido.");
          const names = objects.filter((o) => o.bucket === bucket).map((o) => o.name);
          if (names.some((name) => !name.startsWith(actor.id + "/")))
            throw Error("Objeto fora da conta; recuperação administrativa necessária.");
          await services.remove(bucket, names);
        }
      }
      return reply(202, { status: "processing" });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível concluir a exclusão. Seus registros estão bloqueados para alterações; tente novamente.";
      return reply(409, { error: message });
    }
  };
}
