import { Link } from 'react-router-dom';
import LegalPage, { Company, ContactEmail } from './LegalPage';

// Ao alterar este texto, atualize LEGAL_VERSION em server/utils/legal.js (todos aceitam de novo).
const Terms = () => (
  <LegalPage title="Termos de Uso">
    {(legal) => (
      <>
        <p>
          Estes Termos de Uso regem a contratação e o uso do SmartMaint, sistema online de gestão de manutenção
          oferecido por <Company legal={legal} /> (“SmartMaint”, “nós”). Ao criar uma conta, assinar um plano ou
          usar o sistema, a empresa contratante (“Cliente”) e cada pessoa que o utiliza em nome dela (“Usuário”)
          concordam com estes Termos e com a <Link to="/privacidade">Política de Privacidade</Link>.
        </p>

        <h2>1. O serviço</h2>
        <p>
          O SmartMaint é oferecido como serviço (SaaS), acessado pela internet. Ele permite cadastrar equipamentos,
          registrar ordens de serviço, falhas e reparos, planejar manutenções preventivas, controlar estoque de peças
          e calcular indicadores de confiabilidade. Os recursos de cada plano e seus limites (usuários, equipamentos e
          unidades) são os apresentados na tela de assinatura no momento da contratação.
        </p>

        <h2>2. Conta e acesso</h2>
        <ul>
          <li>Quem cria a conta declara ter poderes para contratar em nome do Cliente e fornecer dados verdadeiros.</li>
          <li>O Cliente é responsável pelos Usuários que cadastra, pelos perfis de acesso que atribui e por manter as senhas em sigilo.</li>
          <li>Suspeita de acesso indevido deve ser comunicada imediatamente pelo e-mail de contato abaixo.</li>
          <li>É proibido usar o sistema para fins ilícitos, tentar acessar dados de outros clientes, sobrecarregar ou testar a segurança do serviço sem autorização por escrito.</li>
        </ul>

        <h2>3. Assinatura, teste grátis e pagamento</h2>
        <ul>
          <li>A assinatura é mensal e renovada automaticamente até ser cancelada. O valor é o do plano escolhido ou o negociado em contrato.</li>
          <li>Na assinatura com cartão de crédito (ou Pix Automático, quando disponível) há um período de teste grátis, oferecido uma única vez por Cliente, com a duração informada na tela de assinatura. Ao fim do teste a primeira mensalidade é cobrada automaticamente, salvo cancelamento antes dessa data.</li>
          <li>Nas assinaturas por boleto ou Pix, a fatura de cada mês é emitida antes do vencimento e enviada por e-mail. O acesso é liberado após a confirmação do primeiro pagamento.</li>
          <li>Os pagamentos são processados pela Stripe. Não armazenamos números de cartão.</li>
          <li>Fatura em atraso por mais de 10 (dez) dias pode levar à suspensão do acesso, restabelecido após a quitação. Os dados não são apagados durante a suspensão.</li>
          <li>Os preços podem ser reajustados mediante aviso prévio de 30 (trinta) dias por e-mail.</li>
          <li>A nota fiscal de serviço é emitida para cada mensalidade paga, com os dados cadastrais informados pelo Cliente.</li>
        </ul>

        <h2>4. Cancelamento</h2>
        <p>
          O Cliente pode cancelar a qualquer momento em Configurações → Faturamento. No cartão, o acesso continua até o
          fim do período já pago; não há reembolso proporcional de períodos iniciados. Podemos encerrar a conta em caso
          de violação destes Termos ou de inadimplência prolongada, com aviso prévio por e-mail sempre que possível.
        </p>

        <h2>5. Dados do Cliente</h2>
        <ul>
          <li>As informações cadastradas pelo Cliente pertencem ao Cliente. Nós as tratamos apenas para prestar o serviço, conforme a <Link to="/privacidade">Política de Privacidade</Link>.</li>
          <li>O Administrador pode exportar todos os dados a qualquer momento, em planilha, em Configurações → Empresa.</li>
          <li>Após o cancelamento, os dados ficam disponíveis por até 90 (noventa) dias para exportação. Depois desse prazo, ou antes, a pedido do Cliente, são excluídos, salvo o que a lei obrigar a guardar (por exemplo, registros fiscais e de pagamento).</li>
          <li>Contas criadas pelo cadastro que não chegam a assinar um plano são excluídas automaticamente após 30 (trinta) dias.</li>
        </ul>

        <h2>6. Disponibilidade e suporte</h2>
        <p>
          Empregamos esforços razoáveis para manter o sistema disponível 24 horas por dia, com cópias de segurança
          diárias e monitoramento contínuo. Podem ocorrer interrupções para manutenção (preferencialmente fora do horário
          comercial) ou por falhas de terceiros, como provedores de nuvem e de internet. O suporte é prestado pelo e-mail
          de contato, em dias úteis.
        </p>

        <h2>7. Responsabilidades</h2>
        <ul>
          <li>O SmartMaint é uma ferramenta de apoio à gestão. As decisões de manutenção, segurança e operação dos equipamentos continuam sendo do Cliente e de seus profissionais habilitados. Indicadores e previsões (MTBF, MTTR, confiabilidade) dependem da qualidade dos dados informados.</li>
          <li>Nossa responsabilidade total, por qualquer causa, limita-se ao valor pago pelo Cliente nos 12 (doze) meses anteriores ao evento, e não abrange lucros cessantes ou danos indiretos, exceto nos casos em que a lei não permitir essa limitação.</li>
        </ul>

        <h2>8. Propriedade intelectual</h2>
        <p>
          O software, a marca e o conteúdo do SmartMaint são nossos. A assinatura concede ao Cliente uma licença de uso,
          não exclusiva e intransferível, enquanto estiver vigente. Não é permitido copiar, revender ou fazer engenharia
          reversa do sistema.
        </p>

        <h2>9. Alterações destes Termos</h2>
        <p>
          Podemos atualizar estes Termos. Mudanças relevantes são comunicadas por e-mail e no próprio sistema, que pede
          um novo aceite no acesso seguinte. A versão vigente fica sempre disponível nesta página.
        </p>

        <h2>10. Lei aplicável e foro</h2>
        <p>
          Estes Termos seguem as leis brasileiras. Fica eleito o foro da comarca da sede do SmartMaint para resolver
          eventuais controvérsias, salvo disposição legal em contrário.
        </p>

        <h2>11. Contato</h2>
        <p>Dúvidas sobre estes Termos: <ContactEmail legal={legal} />.</p>
      </>
    )}
  </LegalPage>
);

export default Terms;
