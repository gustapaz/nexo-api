# Segurança e operação

Todos os endpoints são públicos. O serviço não guarda planos ou recursos por usuário e não precisa de login. Use somente exemplos sintéticos, nunca dados pessoais ou planos sensíveis.

O stream é limitado a 32 KiB contados em bytes reais. São permitidas até 64 tarefas, 256 dependências e 8 trabalhadores. Durações inteiras de 1 a 86400 mantêm somas dentro de u32. Não são aceitos corpos comprimidos, propriedades extras, referências desconhecidas ou IDs duplicados. JSON/UTF-8 inválido retorna 400; contrato inválido, 422; ciclos, 409.

Não há execução de shell, tarefas, código do usuário, pagamentos ou mensagens. O módulo WASM não tem imports de filesystem ou rede. A memória é isolada por cálculo e a ABI não é exposta ao usuário.

Origin de navegador deve coincidir com o serviço; clientes sem Origin são aceitos. Não há CORS permissivo, cookies ou tokens. Origin não é autenticação. Respostas não são armazenadas em cache e incluem nosniff, Referrer-Policy e request IDs. Erros não expõem stack ou payload. A infraestrutura pode registrar metadados; a aplicação não registra planos.

Não há rate limit global ou defesa DDoS própria. O trabalho por chamada é limitado; cotas e disponibilidade dependem da hospedagem Sites. Nenhum cartão, faturamento, trial ou plano pago foi ativado. A demonstração não tem SLA ou promessa de gratuidade permanente.

Testes verificam dependências, ausência de sobreposição, caminho crítico com oráculo recursivo independente, entrada máxima, ciclos, isolamento paralelo e falhas HTTP. A CI também executa os testes Rust nativos. Isso comprova comportamentos específicos, sem certificar ausência de vulnerabilidades.
