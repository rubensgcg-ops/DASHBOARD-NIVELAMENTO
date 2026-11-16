# DASHBOARD-NIVELAMENTO

https://rubensgcg-ops.github.io/DASHBOARD-NIVELAMENTO/

## Fonte de dados

O dashboard lê a planilha do Google pelo endpoint do Apps Script
(`apps-script/Code.gs`), o que permite manter a planilha **privada**.

Se `DATA_ENDPOINT` no `index.html` ainda estiver com o placeholder
(`SEU_DEPLOYMENT_ID`), o site tenta ler a planilha direto pelo GViz —
nesse caso ela precisa estar compartilhada como *qualquer pessoa com o link*.

### Publicando o endpoint (só uma vez)

1. Abra a planilha → **Extensões → Apps Script**.
2. Apague o conteúdo de `Código.gs` e cole o conteúdo de `apps-script/Code.gs`.
3. **Implantar → Nova implantação → Tipo: App da Web**
   - Descrição: `Dashboard Nivelamento`
   - Executar como: **Eu**
   - Quem tem acesso: **Qualquer pessoa**
4. Autorize o script (é a sua própria conta).
5. Copie a URL que termina em `/exec`.
6. Cole no `index.html`, em:

   ```js
   const DATA_ENDPOINT = 'https://script.google.com/macros/s/SEU_DEPLOYMENT_ID/exec';
   ```

7. Commit e push. A planilha pode voltar a ser restrita.

### Observações

- Nomes das abas precisam ser exatamente `Terça` e `Quinta`
  (ajuste `SHEET_NAMES` no `Code.gs` se mudar).
- Colunas lidas: **A** = Avaliado (TRUE/FALSE), **B** = Nome,
  **C** = Nível, **D** = Papel. A primeira linha é cabeçalho.
- `TOKEN` no `Code.gs` + `DATA_TOKEN` no `index.html` (mesmo valor) deixam o
  endpoint inacessível sem o segredo.
- Ao alterar o `Code.gs`, é preciso criar uma **nova implantação** (ou
  *Gerenciar implantações → editar → nova versão*) para valer.
- O site consulta o endpoint a cada 3s e pausa quando a aba está em segundo plano.
- `CACHE_SECONDS` no `Code.gs` (hoje **7s**) evita leituras repetidas na planilha.
  Ajuste de velocidade:
  - cache 7s + consulta 3s → defasagem de ~4 a 11s (configuração atual)
  - cache 3s + consulta 3s → ~2 a 7s (mais requisições)
  - cache 10s + consulta 10s → ~10 a 21s (mais econômico)
- Para mudar a frequência, edite `POLL_MS` no `index.html`; para mudar o cache,
  edite `CACHE_SECONDS` no `Code.gs` e publique uma nova versão.