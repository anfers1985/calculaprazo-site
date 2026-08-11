// Lista fixa das calculadoras do site — elas não vivem no posts.json, então
// mantemos essa lista à parte só pra newsletter poder indicá-las.
// Se criar uma calculadora nova, adicione uma linha aqui (e também no
// array equivalente em admin/index.html, seção Newsletter).
export const CALCULATORS = [
  { slug: 'calculadora-verbas-trabalhistas', nome: 'Calculadora de Verbas Rescisórias', desc: 'Saldo de salário, férias, 13º, FGTS, multa e aviso prévio conforme CLT.' },
  { slug: 'calculadora-salario-liquido', nome: 'Calculadora de Salário Líquido', desc: 'Desconto automático de INSS, IR e dependentes com tabelas atualizadas.' },
  { slug: 'calculadora-de-juros', nome: 'Calculadora de Juros', desc: 'Juros simples, compostos, de mora e montante final, com tabela mês a mês.' },
  { slug: 'correcao-monetaria', nome: 'Correção Monetária', desc: 'Atualização de valores pelos índices IPCA, IGP-M, INPC e SELIC.' },
  { slug: 'calculadora-salario-intermitente', nome: 'Calculadora de Salário Intermitente', desc: 'Remuneração do trabalho intermitente: DSR, férias, 13º, FGTS, INSS e IRRF.' },
  { slug: 'calculadora-de-prescricao', nome: 'Calculadora de Prescrição', desc: 'Prazo prescricional trabalhista, cível e tributário.' },
  { slug: 'calculadora-de-prazo-processual', nome: 'Calculadora de Prazo Processual', desc: 'Mais de 30 prazos processuais pré-configurados: CLT, CPC, tributário e RH.' },
  { slug: 'calculadora-de-porcentagem', nome: 'Calculadora de Porcentagem', desc: 'Porcentagem, desconto, aumento percentual e variação entre valores.' },
  { slug: 'calculadora-de-datas', nome: 'Calculadora de Datas', desc: 'Diferença entre datas, soma ou subtração de dias, dia da semana.' },
  { slug: 'calculadora-imc', nome: 'Calculadora de IMC', desc: 'Índice de Massa Corporal conforme a tabela da OMS.' },
  { slug: 'conversor-de-moedas', nome: 'Conversor de Moedas', desc: 'Conversão entre Real, Dólar, Euro, Libra e outras moedas.' },
  { slug: 'gerador-de-qr-code', nome: 'Gerador de QR Code', desc: 'QR Codes para links, textos, e-mails, telefones e PIX.' },
  { slug: 'gerador-de-senhas', nome: 'Gerador de Senhas', desc: 'Senhas aleatórias e seguras, com regras personalizáveis.' },
  { slug: 'numero-por-extenso', nome: 'Número por Extenso', desc: 'Converte números e valores em reais para texto por extenso.' },
  { slug: 'validador-cpf-cnpj', nome: 'Validador de CPF/CNPJ', desc: 'Validação instantânea com verificação de dígitos.' },
];
