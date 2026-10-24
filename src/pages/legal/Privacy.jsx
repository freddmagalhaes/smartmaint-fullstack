import { Link } from 'react-router-dom';
import LegalPage, { Company, ContactEmail } from './LegalPage';

// Ao alterar este texto, atualize LEGAL_VERSION em server/utils/legal.js (todos aceitam de novo).
const Privacy = () => (
  <LegalPage title="Política de Privacidade">
    {(legal) => (
      <>
        <p>
          Esta Política explica como <Company legal={legal} /> (“SmartMaint”, “nós”) trata dados pessoais no sistema
          SmartMaint, em conformidade com a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018, “LGPD”) e com o
          Marco Civil da Internet (Lei nº 12.965/2014). Ela complementa os <Link to="/termos">Termos de Uso</Link>.
        </p>

        <h2>1. Papéis de cada um</h2>
        <ul>
          <li><strong>Somos controladores</strong> dos dados de cadastro, acesso e cobrança das empresas clientes e de seus usuários (por exemplo, nome, e-mail e registros de login).</li>
          <li><strong>Somos operadores</strong> dos dados que cada empresa cliente cadastra sobre a própria operação, como responsáveis por ordens de serviço, comentários e anexos. Nesses casos, a empresa cliente é a controladora e decide sobre esses dados; nós os tratamos apenas para prestar o serviço, conforme as instruções dela.</li>
        </ul>

        <h2>2. Dados que tratamos</h2>
        <ul>
          <li><strong>Cadastro:</strong> nome, e-mail, telefone e perfil de acesso dos usuários; razão social, CNPJ, endereço e contatos da empresa.</li>
          <li><strong>Acesso e segurança:</strong> senha (guardada apenas de forma cifrada, irreversível), endereço IP, data e hora de login e das ações realizadas, navegador usado no aceite destes documentos.</li>
          <li><strong>Uso do sistema:</strong> informações cadastradas pela empresa (equipamentos, ordens de serviço, falhas, estoque, fotos e anexos), que podem conter nomes de pessoas.</li>
          <li><strong>Cobrança:</strong> plano, valores, faturas e status de pagamento. Os dados do cartão são informados diretamente à Stripe e não passam pelos nossos servidores.</li>
        </ul>
        <p>
          Não usamos cookies de publicidade nem ferramentas de rastreamento. O navegador guarda apenas o necessário para
          manter a sessão aberta e preferências da tela (armazenamento local) e, para o uso sem internet, uma cópia das
          últimas telas operacionais consultadas e das ações feitas sem conexão até serem enviadas. Essa cópia é apagada ao sair do sistema.
        </p>

        <h2>3. Para que usamos e com qual base legal</h2>
        <ul>
          <li><strong>Prestar o serviço contratado</strong> (criar a conta, permitir o acesso, enviar avisos de manutenção e cobrança): execução de contrato (art. 7º, V).</li>
          <li><strong>Emitir notas fiscais e guardar registros de pagamento:</strong> cumprimento de obrigação legal (art. 7º, II).</li>
          <li><strong>Manter registros de acesso:</strong> obrigação legal do Marco Civil da Internet (art. 15).</li>
          <li><strong>Proteger o sistema contra fraudes e acessos indevidos e investigar falhas:</strong> legítimo interesse (art. 7º, IX).</li>
          <li><strong>Defender direitos</strong> em processos judiciais ou administrativos: exercício regular de direitos (art. 7º, VI).</li>
        </ul>

        <h2>4. Com quem compartilhamos</h2>
        <p>Nunca vendemos dados pessoais. Compartilhamos apenas o necessário com:</p>
        <ul>
          <li><strong>Amazon Web Services (AWS):</strong> hospedagem do sistema, do banco de dados, dos arquivos e envio de e-mails, na região de São Paulo (Brasil).</li>
          <li><strong>Stripe:</strong> processamento dos pagamentos (cartão, boleto e Pix).</li>
          <li><strong>Sentry:</strong> registro técnico de erros, quando ativado, para corrigirmos falhas.</li>
          <li><strong>Administração tributária:</strong> dados da empresa tomadora na emissão da nota fiscal de serviço (Emissor Nacional de NFS-e).</li>
          <li><strong>Autoridades públicas</strong>, quando houver obrigação legal ou ordem judicial.</li>
        </ul>
        <p>
          Stripe e Sentry podem tratar dados fora do Brasil. Essas transferências seguem o art. 33 da LGPD, com
          fornecedores que adotam cláusulas contratuais e garantias de proteção compatíveis.
        </p>

        <h2>5. Por quanto tempo guardamos</h2>
        <ul>
          <li>Dados da conta e do uso do sistema: enquanto o contrato estiver ativo e por até 90 dias após o cancelamento (para exportação), sendo excluídos depois disso ou antes, a pedido da empresa.</li>
          <li>Contas criadas pelo cadastro e nunca assinadas: excluídas automaticamente após 30 dias.</li>
          <li>Registros de acesso (data, hora e IP): no mínimo 6 meses, conforme o Marco Civil da Internet, e enquanto forem necessários à segurança.</li>
          <li>Faturas, notas fiscais e registros de pagamento: pelo prazo exigido pela legislação fiscal (em regra, 5 anos).</li>
          <li>Cópias de segurança e versões anteriores de arquivos são descartadas automaticamente em até 30 dias.</li>
        </ul>

        <h2>6. Como protegemos</h2>
        <p>
          Conexões sempre criptografadas (HTTPS), banco de dados e arquivos criptografados, senhas cifradas, separação
          dos dados de cada empresa, acesso por perfil, registro de auditoria das ações, firewall de aplicação, cópias de
          segurança diárias e monitoramento contínuo. Em caso de incidente de segurança que possa causar risco ou dano
          relevante, comunicaremos as empresas afetadas e a Autoridade Nacional de Proteção de Dados (ANPD), conforme a LGPD.
        </p>

        <h2>7. Seus direitos</h2>
        <p>
          O titular dos dados pode pedir, a qualquer momento: confirmação de que tratamos seus dados; acesso a eles;
          correção de dados incompletos ou desatualizados; anonimização, bloqueio ou eliminação de dados desnecessários;
          portabilidade; informação sobre com quem compartilhamos; e revisão de decisões automatizadas. Também pode
          apresentar reclamação à ANPD.
        </p>
        <ul>
          <li>Usuários podem atualizar nome e senha em Configurações → Meu Perfil.</li>
          <li>Administradores da empresa podem exportar todos os dados em planilha em Configurações → Empresa.</li>
          <li>Quando a empresa cliente for a controladora (item 1), encaminharemos o pedido a ela e a apoiaremos na resposta.</li>
        </ul>

        <h2>8. Encarregado e contato</h2>
        <p>
          {legal.dpo_name ? <>Encarregado pelo tratamento de dados pessoais: <strong>{legal.dpo_name}</strong>. </> : null}
          Pedidos e dúvidas sobre dados pessoais: <ContactEmail legal={legal} />. Respondemos em até 15 dias.
        </p>

        <h2>9. Alterações</h2>
        <p>
          Esta Política pode ser atualizada. Mudanças relevantes são comunicadas por e-mail e no próprio sistema, que pede
          um novo aceite no acesso seguinte. O SmartMaint é destinado a empresas e não se dirige a menores de 18 anos.
        </p>
      </>
    )}
  </LegalPage>
);

export default Privacy;
