import { useState, useEffect } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { supabase } from '../supabaseClient'
import { formatarMoeda, diasDesde, formatarData, categoriaRelacionamento, LABEL_CATEGORIA } from '../lib/helpers'
import { exportarParaExcel } from '../lib/excel'

const CORES = ['#B0673A', '#C9A15A', '#5C6E4A', '#8C5A3C', '#3B2417']

const ESTILO_CATEGORIA = {
  em_dia: { emoji: '🟢', cor: 'text-mata-moss', bg: 'bg-mata-moss/10' },
  atencao: { emoji: '🟡', cor: 'text-amber-600', bg: 'bg-amber-50' },
  precisa_contato: { emoji: '🔴', cor: 'text-red-600', bg: 'bg-red-50' },
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { setPageHeader } = useOutletContext()
  const [carregando, setCarregando] = useState(true)
  const [contatos, setContatos] = useState([])
  const [visitas, setVisitas] = useState([])
  const [vendas, setVendas] = useState([])
  const [itensPorVenda, setItensPorVenda] = useState({})
  const [categoriaPorProduto, setCategoriaPorProduto] = useState({})
  const [metaMes, setMetaMes] = useState(null)
  const [categoriaAberta, setCategoriaAberta] = useState(null) // 'em_dia' | 'atencao' | 'precisa_contato' | null

  useEffect(() => {
    carregar()
  }, [])

  useEffect(() => {
    setPageHeader({
      title: 'Dashboard',
      subtitle: 'Visão geral do seu negócio',
      actions: (
        <button
          onClick={() => exportarParaExcel({ contatos, visitas, vendas, itensPorVenda })}
          className="inline-flex items-center gap-2 bg-gradient-to-r from-[#9A5B20] to-[#B8782D] text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-[0_8px_20px_rgba(154,91,32,0.20)] hover:brightness-105 transition"
        >
          <span aria-hidden="true">⇩</span>
          Exportar para Excel
        </button>
      ),
    })

    return () => setPageHeader({ title: '', subtitle: '', actions: null })
  }, [setPageHeader, contatos, visitas, vendas, itensPorVenda])

  async function carregar() {
    setCarregando(true)
    const { data: cData } = await supabase.from('contatos').select('*')
    const { data: vData } = await supabase.from('visitas').select('*, contatos(nome)').order('data_visita', { ascending: false })
    const { data: vendaData } = await supabase.from('vendas').select('*, contatos(nome)').order('data_venda', { ascending: false })
    const { data: iData } = await supabase.from('itens_venda').select('*')
    const { data: prodData } = await supabase.from('produtos').select('id, categoria')

    const catPorProduto = {}
    ;(prodData || []).forEach((p) => {
      catPorProduto[p.id] = p.categoria || 'Outros'
    })

    const primeiroDiaMes = new Date()
    primeiroDiaMes.setDate(1)
    const mesISO = primeiroDiaMes.toISOString().slice(0, 10)
    const { data: metaData } = await supabase
      .from('metas_mensais')
      .select('valor_meta')
      .eq('mes', mesISO)
      .maybeSingle()
    setMetaMes(metaData?.valor_meta ?? null)

    const agrupado = {}
    ;(iData || []).forEach((i) => {
      if (!agrupado[i.venda_id]) agrupado[i.venda_id] = []
      agrupado[i.venda_id].push(i)
    })

    setContatos(cData || [])
    setVisitas(vData || [])
    setVendas(vendaData || [])
    setItensPorVenda(agrupado)
    setCategoriaPorProduto(catPorProduto)
    setCarregando(false)
  }

  if (carregando) return <div className="p-8 text-mata-ink/50 text-sm">Carregando…</div>

  // -------- filtro base: relacionamento considera SÓ contatos ativos hoje --------
  const contatosAtivos = contatos.filter((c) => c.ativo !== false)
  const idsAtivos = new Set(contatosAtivos.map((c) => c.id))
  const visitasAtivas = visitas.filter((v) => !v.contato_id || idsAtivos.has(v.contato_id))
  const vendasAtivasHoje = vendas.filter((v) => idsAtivos.has(v.contato_id))

  // -------- filtro para indicadores financeiros: conta vendas de contatos
  // ativos normalmente, e de contatos inativos até a data em que ficaram
  // inativos (vendas feitas antes da desativação continuam no histórico) --------
  const contatosPorId = {}
  contatos.forEach((c) => {
    contatosPorId[c.id] = c
  })

  function vendaContaNoHistorico(v) {
    const c = contatosPorId[v.contato_id]
    if (!c) return false
    if (c.ativo !== false) return true
    if (!c.data_inativacao) return false // inativo sem data registrada: não conta, por segurança
    return new Date(v.data_venda) <= new Date(c.data_inativacao)
  }

  const vendasParaIndicadores = vendas.filter(vendaContaNoHistorico)

  // -------- cálculos financeiros (contatos ativos + inativos até a data de inativação) --------
  const hoje = new Date()
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)

  let rendaMes = 0
  let rendaAcumulada = 0
  const vendasPorMes = {}
  const produtoVendas = {}
  const clienteTotais = {}

  vendasParaIndicadores.forEach((v) => {
    const itens = itensPorVenda[v.id] || []
    const totalVenda = itens.reduce((s, i) => s + i.quantidade * i.valor_unitario, 0)
    rendaAcumulada += totalVenda
    if (new Date(v.data_venda) >= inicioMes) rendaMes += totalVenda

    const mesLabel = new Date(v.data_venda).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
    vendasPorMes[mesLabel] = (vendasPorMes[mesLabel] || 0) + totalVenda

    const nomeCliente = v.contatos?.nome || 'Desconhecido'
    clienteTotais[nomeCliente] = (clienteTotais[nomeCliente] || 0) + totalVenda

    itens.forEach((i) => {
      produtoVendas[i.produto_nome] = (produtoVendas[i.produto_nome] || 0) + i.quantidade
    })
  })

  const graficoMensal = Object.entries(vendasPorMes)
    .slice(-6)
    .map(([mes, total]) => ({ mes, total }))

  const topProdutos = Object.entries(produtoVendas)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([nome, qtd]) => ({ nome, qtd }))

  const topClientes = Object.entries(clienteTotais)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([nome, total]) => ({ nome, total }))

  // -------- vendas por categoria de produto (quantidade de itens) --------
  const categoriaQtd = {}
  let totalItensVendidos = 0
  vendasParaIndicadores.forEach((v) => {
    const itens = itensPorVenda[v.id] || []
    itens.forEach((i) => {
      const cat = (i.produto_id && categoriaPorProduto[i.produto_id]) || 'Outros'
      categoriaQtd[cat] = (categoriaQtd[cat] || 0) + i.quantidade
      totalItensVendidos += i.quantidade
    })
  })
  const vendasPorCategoria = Object.entries(categoriaQtd)
    .sort((a, b) => b[1] - a[1])
    .map(([categoria, qtd]) => ({
      categoria,
      qtd,
      pct: totalItensVendidos ? Math.round((qtd / totalItensVendidos) * 100) : 0,
    }))

  // -------- meta x realizado --------
  const percentualMeta = metaMes ? Math.min(100, Math.round((rendaMes / metaMes) * 100)) : null

  // -------- relacionamento: último contato (visita ou venda) por contato --------
  // considerando somente visitas/vendas ligadas a contatos ativos
  const ultimoContato = {}
  ;[...visitasAtivas.filter((v) => v.contato_id), ...vendasAtivasHoje].forEach((r) => {
    const data = r.data_visita || r.data_venda
    const id = r.contato_id
    if (!ultimoContato[id] || new Date(data) > new Date(ultimoContato[id])) {
      ultimoContato[id] = data
    }
  })

  // classifica cada contato ativo em em_dia / atencao / precisa_contato
  const porCategoria = { em_dia: [], atencao: [], precisa_contato: [] }
  contatosAtivos.forEach((c) => {
    const cat = categoriaRelacionamento(ultimoContato[c.id])
    porCategoria[cat].push(c)
  })

  // lista "precisa de contato" ordenada pelo maior número de dias sem contato primeiro
  // (nunca contatado conta como o maior atraso possível)
  function ordenarPorDiasDesc(lista) {
    return [...lista].sort((a, b) => {
      const diasA = diasDesde(ultimoContato[a.id])
      const diasB = diasDesde(ultimoContato[b.id])
      if (diasA === null && diasB === null) return 0
      if (diasA === null) return -1
      if (diasB === null) return 1
      return diasB - diasA
    })
  }

  const listaCategoriaAberta = categoriaAberta
    ? categoriaAberta === 'precisa_contato'
      ? ordenarPorDiasDesc(porCategoria[categoriaAberta])
      : porCategoria[categoriaAberta]
    : []

  function verCliente(id) {
    setCategoriaAberta(null)
    navigate('/cadastro', { state: { editarContatoId: id } })
  }

  function registrarContato(id) {
    setCategoriaAberta(null)
    navigate('/visitas', { state: { novoContatoId: id } })
  }

  return (
    <div className="w-full pb-3 space-y-[1px]">
      {/* Indicadores financeiros */}
      <section className="grid grid-cols-1 xl:grid-cols-[446fr_480fr] gap-[5px]">
        <div className="group bg-white/90 border border-[#eadfce] rounded-2xl px-5 py-3 shadow-[0_10px_30px_rgba(77,45,18,0.05)] flex items-center gap-2 xl:h-[80px]">
          <div className="w-10 h-10 rounded-2xl bg-[#f5ecdd] text-[#9A5B20] flex items-center justify-center text-3xl shrink-0">▥</div>
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-[0.08em] text-mata-ink/55">Renda do mês</p>
            <p className="font-display text-3xl lg:text-4xl text-mata-ink leading-tight mt-1">{formatarMoeda(rendaMes)}</p>
          </div>
          <span className="text-[#9A5B20] text-3xl opacity-70 group-hover:translate-x-1 transition-transform">›</span>
        </div>
        <div className="group bg-white/90 border border-[#eadfce] rounded-2xl px-5 py-3 shadow-[0_10px_30px_rgba(77,45,18,0.05)] flex items-center gap-2 xl:h-[80px]">
          <div className="w-16 h-16 rounded-2xl bg-[#f5ecdd] text-[#9A5B20] flex items-center justify-center text-3xl shrink-0">◉</div>
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-[0.08em] text-mata-ink/55">Renda acumulada</p>
            <p className="font-display text-3xl lg:text-4xl text-mata-ink leading-tight mt-1">{formatarMoeda(rendaAcumulada)}</p>
          </div>
          <span className="text-[#9A5B20] text-3xl opacity-70 group-hover:translate-x-1 transition-transform">›</span>
        </div>
      </section>

      {/* Relacionamento — clicável */}
      <section className="grid grid-cols-1 md:grid-cols-[396fr_422fr_397fr] gap-[5px]">
        {['em_dia', 'atencao', 'precisa_contato'].map((cat) => {
          const estilo = ESTILO_CATEGORIA[cat]
          const icone = cat === 'em_dia' ? '♟' : cat === 'atencao' ? '!' : '☎'
          const descricao =
            cat === 'em_dia'
              ? 'clientes ativos'
              : cat === 'atencao'
                ? 'sem compra recente'
                : 'contatos pendentes'

          return (
            <button
              key={cat}
              onClick={() => setCategoriaAberta(cat)}
              className="group text-left bg-white/90 border border-[#eadfce] rounded-2xl px-5 py-3 shadow-[0_8px_26px_rgba(77,45,18,0.04)] hover:shadow-[0_12px_30px_rgba(77,45,18,0.09)] transition-all flex items-center gap-2 xl:h-[80px]"
            >
              <div className="w-14 h-14 rounded-2xl bg-[#f5ecdd] text-[#9A5B20] flex items-center justify-center text-2xl shrink-0">
                {icone}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-[0.06em] text-mata-ink/55 flex items-center gap-2">
                  <span>{estilo.emoji}</span>
                  {LABEL_CATEGORIA[cat]}
                </p>
                <div className="flex items-baseline gap-2 mt-1">
                  <p className={`font-display text-3xl leading-none ${estilo.cor}`}>{porCategoria[cat].length}</p>
                  <span className="text-xs text-mata-ink/55 truncate">{descricao}</span>
                </div>
              </div>
              <span className="text-[#9A5B20] text-3xl opacity-70 group-hover:translate-x-1 transition-transform">›</span>
            </button>
          )
        })}
      </section>

      {/* Gráficos principais */}
      <section className="grid grid-cols-1 xl:grid-cols-[642fr_587fr] gap-[5px]">
        <div className="bg-white/90 border border-[#eadfce] rounded-2xl p-4 shadow-[0_10px_30px_rgba(77,45,18,0.05)] xl:h-[200px] flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-3">
              <span className="text-[#9A5B20] text-2xl">▥</span>
              <h3 className="font-display text-2xl text-mata-ink">Vendas por mês</h3>
            </div>
            <span className="hidden sm:inline-flex border border-[#eadfce] rounded-xl px-3 py-1.5 text-xs text-mata-ink/65 bg-[#fbf7f0]">Últimos 6 meses</span>
          </div>

          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={graficoMensal} margin={{ top: 10, right: 8, left: 6, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EDE3D3" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#59483A' }} axisLine={{ stroke: '#D9C7AE' }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#59483A' }} width={55} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => formatarMoeda(v)} />
                <Bar dataKey="total" fill="#A96A26" radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white/90 border border-[#eadfce] rounded-2xl p-4 shadow-[0_10px_30px_rgba(77,45,18,0.05)] xl:h-[200px] flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-3">
              <span className="text-[#9A5B20] text-2xl">◎</span>
              <h3 className="font-display text-2xl text-mata-ink">Meta x realizado</h3>
            </div>
            <span className="hidden sm:inline-flex border border-[#eadfce] rounded-xl px-3 py-1.5 text-xs text-mata-ink/65 bg-[#fbf7f0]">
              {new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </span>
          </div>

          {metaMes === null ? (
            <div className="flex-1 flex items-center justify-center text-sm text-mata-ink/40 text-center px-4">
              <div>
                <p>Meta não definida para este mês.</p>
                <p className="mt-1">Cadastre em <code className="text-xs bg-mata-sand/50 px-1 rounded">metas_mensais</code> no Supabase.</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_145px] gap-4 items-end min-h-0">
              <div className="grid grid-cols-2 gap-8 h-full items-end px-3">
                <div className="h-full flex flex-col justify-end items-center gap-2">
                  <p className="font-display text-lg text-mata-ink">{formatarMoeda(metaMes)}</p>
                  <div className="w-full max-w-[110px] bg-[#e9ddcb] rounded-t-xl" style={{ height: '65%' }} />
                  <p className="text-xs text-mata-ink/60">Meta</p>
                </div>
                <div className="h-full flex flex-col justify-end items-center gap-2">
                  <p className="font-display text-lg text-mata-ink">{formatarMoeda(rendaMes)}</p>
                  <div
                    className="w-full max-w-[110px] bg-gradient-to-t from-[#8d521e] to-[#b97a2e] rounded-t-xl"
                    style={{ height: `${Math.max(8, Math.min(65, (rendaMes / metaMes) * 65))}%` }}
                  />
                  <p className="text-xs text-mata-ink/60">Realizado</p>
                </div>
              </div>

              <div className="border-l border-[#eadfce] pl-5 pb-6 text-center sm:text-left">
                <p className="font-display text-5xl text-[#9A5B20] leading-none">{percentualMeta}%</p>
                <p className="text-sm text-mata-ink/60 mt-2">da meta alcançada</p>
                <div className="h-3 bg-[#eee4d5] rounded-full mt-5 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#8d521e] to-[#c18a3d] rounded-full" style={{ width: `${percentualMeta}%` }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Produtos + categorias */}
      <section className="grid grid-cols-1 xl:grid-cols-[642fr_587fr] gap-[5px]">
        <div className="bg-white/90 border border-[#eadfce] rounded-2xl p-4 shadow-[0_10px_30px_rgba(77,45,18,0.05)] xl:h-[190px] overflow-hidden">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-3">
              <span className="text-[#9A5B20] text-2xl">◇</span>
              <h3 className="font-display text-2xl text-mata-ink">Produtos mais vendidos</h3>
            </div>
            <span className="hidden sm:inline-flex border border-[#eadfce] rounded-xl px-3 py-1.5 text-xs text-mata-ink/65 bg-[#fbf7f0]">Todos os períodos</span>
          </div>

          {topProdutos.length === 0 ? (
            <div className="h-[165px] flex items-center justify-center text-sm text-mata-ink/40 text-center px-4">
              Ainda não há vendas de produtos.
            </div>
          ) : (
            <div className="space-y-1.5">
              {topProdutos.map((produto, i) => (
                <div key={produto.nome} className="grid grid-cols-[36px_1fr_auto] items-center gap-3 px-3 py-2 rounded-xl odd:bg-[#f8f1e7]">
                  <span className="w-7 h-7 rounded-full bg-[#a96a26] text-white flex items-center justify-center text-xs font-medium">{i + 1}</span>
                  <span className="text-sm text-mata-ink truncate">{produto.nome}</span>
                  <span className="text-sm font-semibold text-mata-ink">{produto.qtd}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white/90 border border-[#eadfce] rounded-2xl p-4 shadow-[0_10px_30px_rgba(77,45,18,0.05)] xl:h-[190px] overflow-hidden">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-3">
              <span className="text-[#9A5B20] text-2xl">◔</span>
              <h3 className="font-display text-2xl text-mata-ink">Vendas por categoria</h3>
            </div>
            <span className="hidden sm:inline-flex border border-[#eadfce] rounded-xl px-3 py-1.5 text-xs text-mata-ink/65 bg-[#fbf7f0]">Todos os períodos</span>
          </div>

          {vendasPorCategoria.length === 0 ? (
            <div className="h-[165px] flex items-center justify-center text-sm text-mata-ink/40">Sem vendas de produtos ainda.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-[175px_1fr] items-center gap-4 h-[178px]">
              <div className="relative h-[165px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={vendasPorCategoria} dataKey="qtd" nameKey="categoria" innerRadius="58%" outerRadius="90%" paddingAngle={1}>
                      {vendasPorCategoria.map((_, i) => (
                        <Cell key={i} fill={CORES[i % CORES.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <p className="font-display text-3xl text-mata-ink leading-none">{totalItensVendidos}</p>
                  <p className="text-[11px] text-mata-ink/50 mt-1">itens</p>
                </div>
              </div>

              <ul className="space-y-2 text-sm">
                {vendasPorCategoria.map((c, i) => (
                  <li key={c.categoria} className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CORES[i % CORES.length] }} />
                      <span className="truncate">{c.categoria}</span>
                    </span>
                    <span className="font-medium text-mata-ink/70">{c.pct}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* Modal com a lista detalhada da categoria clicada */}
      {categoriaAberta && (
        <div className="fixed inset-0 bg-[#1d120b]/45 backdrop-blur-[2px] flex items-center justify-center p-4 sm:p-6 z-50">
          <div className="bg-[#fffdfa] border border-[#eadfce] rounded-2xl p-5 sm:p-6 w-full max-w-2xl max-h-[82vh] overflow-y-auto shadow-2xl space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h3 className="font-display text-2xl text-mata-ink">
                {ESTILO_CATEGORIA[categoriaAberta].emoji} {LABEL_CATEGORIA[categoriaAberta]}{' '}
                <span className="text-mata-ink/40 text-sm font-sans">({listaCategoriaAberta.length})</span>
              </h3>
              <button onClick={() => setCategoriaAberta(null)} className="text-mata-ink/45 hover:text-mata-ink text-sm">Fechar ✕</button>
            </div>

            {listaCategoriaAberta.length === 0 ? (
              <p className="text-sm text-mata-ink/40">Nenhum contato ativo nessa categoria.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[620px]">
                  <thead className="text-mata-ink/50 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="text-left py-2">Nome</th>
                      <th className="text-left py-2">Tipo</th>
                      <th className="text-left py-2">Último contato</th>
                      <th className="text-left py-2">Dias</th>
                      <th className="text-right py-2">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listaCategoriaAberta.map((c) => {
                      const ultima = ultimoContato[c.id]
                      const dias = diasDesde(ultima)
                      return (
                        <tr key={c.id} className="border-t border-mata-sand/70">
                          <td className="py-2.5 font-medium">{c.nome}</td>
                          <td className="py-2.5 text-mata-ink/60">{c.tipo === 'comprador' ? 'Compradora' : 'Revendedora'}</td>
                          <td className="py-2.5 text-mata-ink/60">{ultima ? formatarData(ultima) : '—'}</td>
                          <td className="py-2.5 text-mata-ink/60">{dias === null ? 'Nunca contatado' : `${dias}d`}</td>
                          <td className="py-2.5 text-right space-x-3">
                            <button onClick={() => verCliente(c.id)} className="text-mata-copper hover:underline">👁 Ver cliente</button>
                            <button onClick={() => registrarContato(c.id)} className="text-mata-copper hover:underline">📝 Registrar contato</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
