// P4f-fix — Bootstrap central de providers.
// Único propósito: garantir que os adapters sejam CARREGADOS (cada adapter chama
// registerProvider(...) no próprio módulo ao ser importado). Uma rota que precise
// dos providers faz `import "@/lib/providers/register";` uma única vez, em vez de
// importar cada adapter separadamente.
//
// Sem lógica nova: nenhum init/lazy/factory/singleton/wrapper. Apenas side-effect
// imports. Nenhuma rota é modificada por este arquivo (o import é explícito no P4g).

import "./piapi/adapter";
import "./atlas/adapter";
