// Prova que nenhum segredo chega aos logs da Vercel pelo auditLog.
// Caso real (01/10): o body enviado à PiAPI e a resposta de getTaskStatus
// carregam config.webhook_config.secret, que era logado em texto aberto.
import { describe, it, expect, vi, afterEach } from "vitest";
import { auditLog, maskSecret, redactSecrets } from "./audit-log";

const SECRET = "d3b312f3-0000-4ed7-84c5-000000000000";
const PIAPI_BODY = JSON.stringify({
  model: "Wan",
  task_type: "wan26-txt2video",
  input: { prompt: "cachorro dançando", duration: 5 },
  config: {
    service_mode: "public",
    webhook_config: { endpoint: "https://www.fluxyra.app/api/webhooks/piapi", secret: SECRET },
  },
});

describe("audit-log redaction", () => {
  afterEach(() => vi.restoreAllMocks());

  it("mascara secret em objeto aninhado e preserva o resto", () => {
    const out = redactSecrets(JSON.parse(PIAPI_BODY));
    expect(out.config.webhook_config.secret).toBe("[redacted]");
    expect(out.config.webhook_config.endpoint).toBe("https://www.fluxyra.app/api/webhooks/piapi");
    expect(out.input.prompt).toBe("cachorro dançando");
  });

  it("mascara secret dentro de body JSON serializado (request da PiAPI)", () => {
    const out = redactSecrets({ body: PIAPI_BODY });
    expect(out.body).not.toContain(SECRET);
    expect(out.body).toContain('"secret":"[redacted]"');
    expect(out.body).toContain("wan26-txt2video");
  });

  it("mascara secret em resposta JSON aninhada como texto escapado", () => {
    const resp = JSON.stringify({ code: 200, data: JSON.parse(PIAPI_BODY) });
    expect(redactSecrets(resp)).not.toContain(SECRET);
  });

  it("mascara o token do callback da Atlas no path", () => {
    const url = "https://www.fluxyra.app/api/webhooks/atlas/abc123TOKENxyz";
    expect(redactSecrets({ webhook_url: url }).webhook_url).toBe("https://www.fluxyra.app/api/webhooks/atlas/[redacted]");
  });

  it("mantém a forma já mascarada da x-api-key", () => {
    const masked = maskSecret("e63a0000000000000000000000000000000000000000000000000000000c959");
    expect(redactSecrets({ headers: { "x-api-key": masked } }).headers["x-api-key"]).toBe(masked);
  });

  it("auditLog nunca imprime o segredo", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    auditLog("piapi.fetch", "request", "req1", { body: PIAPI_BODY, payload: JSON.parse(PIAPI_BODY) });
    const printed = spy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(printed).not.toContain(SECRET);
    expect(printed).toContain("[redacted]");
  });
});
