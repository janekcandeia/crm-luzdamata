import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { formatarData, formatarMoeda } from '../lib/helpers'

const vendaVazia = { contato_id: '', data_venda: new Date().toISOString().slice(0, 10), forma_pagamento: '', observacoes: '' }

export default function Vendas() {
  const { setPageHeader } = useOutletContext()
  const [vendas, setVendas] = useState([])
  const [contatos, setContatos] = useState([])
  const [produtos, setProdutos] = useState([])
  const [itensPorVenda, setItensPorVenda] = useState({})
  const [carregando, setCarregando] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [busca, setBusca] = useState('')
  const [form, setForm] = useState(vendaVazia)
  const [itensForm, setItensForm] = useState([{ produto_id: '', produto_nome: '', quantidade: 1, valor_unitario: 0 }])

  useEffect(() => {
    carregar()
  }, [])

  useEffect(() => {
    setPageHeader({
      title: 'Vendas',
      subtitle: 'Registro e análise de vendas de produtos',
      actions: (
        <button
          type="button"
          onClick={() => setMostrarForm(true)}
          className="inline-flex items-center gap-2 bg-gradient-to-r from-[#9A5B20] to-[#B8782D] text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-[0_8px_20px_rgba(154,91,32,0.20)] hover:brightness-105 transition"
        >
          <span className="text-lg leading-none">+</span> Nova venda
        </button>
      ),
    })
    return () => setPageHeader({ title: '', subtitle: '', actions: null })
  }, [setPageHeader])

  async function carregar() {
    setCarregando(true)
    const { data: vData } = await supabase
      .from('vendas')
      .select('*, contatos(nome)')
      .order('data_venda', { ascending: false })
    const { data: cData } = await supabase.from('contatos').select('id, nome').order('nome')
    const { data: pData } = await supabase.from('produtos').select('*').eq('ativo', true).order('nome')
    const { data: iData } = await supabase.from('itens_venda').select('*')

    const agrupado = {}
    ;(iData || []).forEach((i) => {
      if (!agrupado[i.venda_id]) agrupado[i.venda_id] = []
      agrupado[i.venda_id].push(i)
    })

    setVendas(vData || [])
    setContatos(cData || [])
    setProdutos(pData || [])
    setItensPorVenda(agrupado)
    setCarregando(false)
  }

  function atualizarItem(idx, campo, valor) {
    const novos = [...itensForm]
    if (campo === 'produto_id') {
      const produto = produtos.find((p) => p.id === valor)
      novos[idx] = { ...novos[idx], produto_id: valor, produto_nome: produto?.nome || '', valor_unitario: produto?.preco || 0 }
    } else {
      novos[idx] = { ...novos[idx], [campo]: valor }
    }
    setItensForm(novos)
  }

  function adicionarLinha() {
    setItensForm([...itensForm, { produto_id: '', produto_nome: '', quantidade: 1, valor_unitario: 0 }])
  }

  function removerLinha(idx) {
    setItensForm(itensForm.filter((_, i) => i !== idx))
  }


  function obterImagemProduto(produto) {
    return produto?.imagem_url || produto?.imagem || produto?.foto_url || produto?.foto || produto?.image_url || produto?.url_imagem || ''
  }

  function diminuirQuantidade(idx) {
    const atual = Number(itensForm[idx]?.quantidade || 1)
    atualizarItem(idx, 'quantidade', Math.max(1, atual - 1))
  }

  function aumentarQuantidade(idx) {
    const atual = Number(itensForm[idx]?.quantidade || 1)
    atualizarItem(idx, 'quantidade', atual + 1)
  }

  async function salvar(e) {
    e.preventDefault()
    const { data: novaVenda } = await supabase.from('vendas').insert(form).select().single()
    const itensValidos = itensForm.filter((i) => i.produto_nome && i.quantidade > 0)
    if (itensValidos.length > 0) {
      await supabase.from('itens_venda').insert(
        itensValidos.map((i) => ({ ...i, venda_id: novaVenda.id }))
      )
    }
    setForm(vendaVazia)
    setItensForm([{ produto_id: '', produto_nome: '', quantidade: 1, valor_unitario: 0 }])
    setMostrarForm(false)
    carregar()
  }

  const totalForm = itensForm.reduce((s, i) => s + (i.quantidade || 0) * (i.valor_unitario || 0), 0)

  const totalVenda = (v) => (itensPorVenda[v.id] || []).reduce((s, i) => s + i.quantidade * i.valor_unitario, 0)
  const totalGeral = vendas.reduce((s, v) => s + totalVenda(v), 0)
  const ticketMedio = vendas.length ? totalGeral / vendas.length : 0

  const inicioMes = new Date()
  inicioMes.setDate(1)
  inicioMes.setHours(0, 0, 0, 0)
  const totalMes = vendas
    .filter((v) => new Date(v.data_venda) >= inicioMes)
    .reduce((s, v) => s + totalVenda(v), 0)

  const buscaNormalizada = busca.trim().toLowerCase()
  const vendasFiltradas = vendas.filter((v) => {
    if (!buscaNormalizada) return true
    return v.contatos?.nome?.toLowerCase().includes(buscaNormalizada)
  })

  return (
    <div className="w-full pb-3 space-y-[1px]">

      <section className="grid grid-cols-1 xl:grid-cols-[446fr_480fr] gap-[5px]">
        <div className="group bg-white/90 border border-[#eadfce] rounded-2xl px-5 py-3 shadow-[0_10px_30px_rgba(77,45,18,0.05)] flex items-center gap-2 xl:h-[80px]">
          <div className="w-10 h-10 rounded-2xl bg-[#f5ecdd] text-[#9A5B20] flex items-center justify-center text-2xl shrink-0">◈</div>
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-[0.08em] text-mata-ink/55">Ticket médio</p>
            <p className="font-display text-3xl lg:text-4xl text-mata-ink leading-tight mt-1">{formatarMoeda(ticketMedio)}</p>
          </div>
        </div>

        <div className="group bg-white/90 border border-[#eadfce] rounded-2xl px-5 py-3 shadow-[0_10px_30px_rgba(77,45,18,0.05)] flex items-center gap-2 xl:h-[80px]">
          <div className="w-10 h-10 rounded-2xl bg-[#f5ecdd] text-[#9A5B20] flex items-center justify-center text-2xl shrink-0">▥</div>
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-[0.08em] text-mata-ink/55">Total vendido no mês</p>
            <p className="font-display text-3xl lg:text-4xl text-mata-ink leading-tight mt-1">{formatarMoeda(totalMes)}</p>
          </div>
        </div>
      </section>

      <section className="bg-white/90 border border-[#eadfce] rounded-2xl px-4 py-2 shadow-[0_8px_26px_rgba(77,45,18,0.04)]">
        <input
          type="text"
          placeholder="Localizar por cliente ou revendedora..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-full sm:w-96 border border-[#eadfce] bg-[#fffdfa] rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#B8782D]/20"
        />
      </section>

      {carregando ? (
        <p className="text-mata-ink/50 text-sm">Carregando…</p>
      ) : vendasFiltradas.length === 0 ? (
        <p className="text-mata-ink/50 text-sm">
          {busca ? 'Nenhum resultado para essa busca.' : 'Nenhuma venda registrada ainda.'}
        </p>
      ) : (
        <div className="space-y-[5px]">
          {vendasFiltradas.map((v) => {
            const itens = itensPorVenda[v.id] || []
            const total = itens.reduce((s, i) => s + i.quantidade * i.valor_unitario, 0)
            return (
              <div key={v.id} className="bg-white/90 border border-[#eadfce] rounded-2xl p-4 shadow-[0_8px_26px_rgba(77,45,18,0.04)]">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{v.contatos?.nome}</span>
                    <span className="text-xs text-mata-ink/50 ml-2">{formatarData(v.data_venda)}</span>
                    {v.forma_pagamento && (
                      <span className="text-[10px] ml-2 px-2 py-0.5 rounded-full bg-[#f5ecdd] text-mata-ink/60">
                        {v.forma_pagamento}
                      </span>
                    )}
                  </div>
                  <span className="font-display text-lg text-mata-copper">{formatarMoeda(total)}</span>
                </div>
                <ul className="mt-2 text-sm text-mata-ink/70 space-y-0.5">
                  {itens.map((i) => (
                    <li key={i.id}>
                      {i.quantidade}x {i.produto_nome} — {formatarMoeda(i.valor_unitario)}
                    </li>
                  ))}
                </ul>
                {v.observacoes && <p className="text-xs text-mata-ink/50 mt-2">{v.observacoes}</p>}
              </div>
            )
          })}
        </div>
      )}

      {mostrarForm && (
        <div className="fixed inset-0 bg-[#20140d]/55 backdrop-blur-[3px] flex items-center justify-center p-3 sm:p-5 z-50 overflow-y-auto">
          <form
            onSubmit={salvar}
            className="relative w-full max-w-[760px] my-4 overflow-hidden rounded-[20px] border border-[#d9b98f] bg-[#fffdf9] shadow-[0_28px_80px_rgba(35,20,10,0.35)]"
          >
            <button
              type="button"
              onClick={() => setMostrarForm(false)}
              className="absolute top-4 right-5 z-20 text-3xl leading-none text-[#3f2718] hover:text-[#9A5B20] transition"
              aria-label="Fechar"
            >
              ×
            </button>

            <div className="relative px-6 sm:px-8 pt-6 pb-4 border-b border-[#eadfce] overflow-hidden">
              <div className="absolute -right-8 -top-10 w-56 h-56 opacity-[0.16] pointer-events-none">
                <div className="absolute right-14 top-10 w-[2px] h-40 bg-[#a66a32] rotate-[20deg] origin-bottom rounded-full" />
                <div className="absolute right-16 top-14 w-24 h-10 border border-[#a66a32] rounded-[100%_0] rotate-[25deg]" />
                <div className="absolute right-7 top-28 w-24 h-10 border border-[#a66a32] rounded-[100%_0] -rotate-[18deg]" />
              </div>

              <div className="pr-16">
                <h3 className="font-display text-[36px] sm:text-[40px] leading-none text-[#3c2417]">Nova venda</h3>
                <p className="mt-2 font-display text-[17px] text-[#9A5B20]">Registre a venda de forma rápida e organizada.</p>
              </div>
              <p className="hidden sm:block absolute right-20 top-8 font-display italic text-[#b5763b] text-[18px] leading-tight text-center rotate-[-7deg]">
                Beleza que gera<br />boas histórias
              </p>
            </div>

            <div className="px-6 sm:px-8 py-5 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-[1.35fr_.9fr_1fr] gap-4">
                <label className="block">
                  <span className="block text-[13px] font-medium text-[#3c2a1f] mb-1.5">Cliente</span>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9A5B20] text-lg">♙</span>
                    <select
                      required
                      value={form.contato_id}
                      onChange={(e) => setForm({ ...form, contato_id: e.target.value })}
                      className="w-full appearance-none border border-[#dec6a8] bg-[#fffdf9] rounded-xl pl-10 pr-9 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#B8782D]/20"
                    >
                      <option value="">Selecione o cliente</option>
                      {contatos.map((c) => (
                        <option key={c.id} value={c.id}>{c.nome}</option>
                      ))}
                    </select>
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#59483A] pointer-events-none">⌄</span>
                  </div>
                </label>

                <label className="block">
                  <span className="block text-[13px] font-medium text-[#3c2a1f] mb-1.5">Data</span>
                  <input
                    type="date"
                    required
                    value={form.data_venda}
                    onChange={(e) => setForm({ ...form, data_venda: e.target.value })}
                    className="w-full border border-[#dec6a8] bg-[#fffdf9] rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#B8782D]/20"
                  />
                </label>

                <label className="block">
                  <span className="block text-[13px] font-medium text-[#3c2a1f] mb-1.5">Forma de pagamento</span>
                  <select
                    value={form.forma_pagamento}
                    onChange={(e) => setForm({ ...form, forma_pagamento: e.target.value })}
                    className="w-full border border-[#dec6a8] bg-[#fffdf9] rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#B8782D]/20"
                  >
                    <option value="">Selecione</option>
                    <option value="Pix">Pix</option>
                    <option value="Dinheiro">Dinheiro</option>
                    <option value="Cartão de crédito">Cartão de crédito</option>
                    <option value="Cartão de débito">Cartão de débito</option>
                    <option value="Boleto">Boleto</option>
                    <option value="Transferência">Transferência</option>
                    <option value="Outro">Outro</option>
                  </select>
                </label>
              </div>

              <section className="rounded-2xl border border-[#eadfce] bg-[#fffaf3] overflow-hidden shadow-[0_8px_24px_rgba(77,45,18,0.04)]">
                <div className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl text-[#8f5725]">🛍</span>
                    <h4 className="font-display text-[24px] text-[#4a2a17]">Itens da venda</h4>
                  </div>
                  <div className="hidden sm:flex items-center gap-3 text-[#a26532] italic font-display text-sm">
                    <span className="w-12 h-px bg-[#c9a06f]" />
                    Produtos que fazem bem, sempre.
                  </div>
                </div>

                <div className="mx-3 sm:mx-4 mb-3">
                  <div className="grid grid-cols-[1fr_84px_104px_100px_34px] gap-2 px-3 py-2 rounded-lg bg-[#f1e8dc] text-[12px] text-[#543726] font-medium">
                    <span>Produto</span>
                    <span className="text-center">Qtd</span>
                    <span className="text-right">Valor unit.</span>
                    <span className="text-right">Subtotal</span>
                    <span />
                  </div>

                  <div className="divide-y divide-[#eee3d5]">
                    {itensForm.map((item, idx) => {
                      const produtoSelecionado = produtos.find((p) => p.id === item.produto_id)
                      const imagem = obterImagemProduto(produtoSelecionado)
                      const subtotal = (Number(item.quantidade) || 0) * (Number(item.valor_unitario) || 0)

                      return (
                        <div key={idx} className="grid grid-cols-[1fr_84px_104px_100px_34px] gap-2 items-center px-3 py-2.5 bg-white/65">
                          <div className="min-w-0 flex items-center gap-3">
                            <div className="w-12 h-12 rounded-lg overflow-hidden border border-[#eadfce] bg-[#f7efe3] shrink-0 flex items-center justify-center">
                              {imagem ? (
                                <img src={imagem} alt={produtoSelecionado?.nome || 'Produto'} className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-xl text-[#a36b36]">✦</span>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <select
                                value={item.produto_id}
                                onChange={(e) => atualizarItem(idx, 'produto_id', e.target.value)}
                                className="w-full bg-transparent text-sm font-medium text-[#2f2118] outline-none cursor-pointer"
                              >
                                <option value="">Selecione o produto</option>
                                {produtos.map((p) => (
                                  <option key={p.id} value={p.id}>{p.nome}</option>
                                ))}
                              </select>
                              {produtoSelecionado && (
                                <p className="text-[11px] text-[#8b796a] truncate mt-0.5">
                                  {produtoSelecionado.descricao || produtoSelecionado.categoria || 'Produto LuzDaMata'}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-center overflow-hidden rounded-lg border border-[#dec6a8] bg-[#fffdf9] h-9">
                            <button type="button" onClick={() => diminuirQuantidade(idx)} className="w-7 h-full text-[#985b26] hover:bg-[#f6ecdf]">−</button>
                            <input
                              type="number"
                              min="1"
                              value={item.quantidade}
                              onChange={(e) => atualizarItem(idx, 'quantidade', Math.max(1, Number(e.target.value) || 1))}
                              className="w-8 h-full text-center text-sm bg-white outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <button type="button" onClick={() => aumentarQuantidade(idx)} className="w-7 h-full text-[#985b26] hover:bg-[#f6ecdf]">+</button>
                          </div>

                          <div className="text-right text-sm text-[#2d2119] whitespace-nowrap">
                            {formatarMoeda(item.valor_unitario || 0)}
                          </div>

                          <div className="text-right text-sm font-medium text-[#2d2119] whitespace-nowrap">
                            {formatarMoeda(subtotal)}
                          </div>

                          <button
                            type="button"
                            onClick={() => removerLinha(idx)}
                            className="text-[#a65e25] hover:text-red-600 text-lg"
                            title="Remover item"
                          >
                            ♲
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </section>

              <button
                type="button"
                onClick={adicionarLinha}
                className="inline-flex items-center gap-2 border border-[#b6783b] text-[#6c401f] bg-[#fffaf3] rounded-xl px-4 py-2 text-sm hover:bg-[#f7ecde] transition"
              >
                <span className="text-xl leading-none">+</span> Adicionar produto
              </button>

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_285px] gap-5 items-end">
                <label className="block">
                  <span className="block text-[13px] font-medium text-[#3c2a1f] mb-1.5">Observações</span>
                  <textarea
                    placeholder="Adicione observações sobre a venda..."
                    value={form.observacoes}
                    onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                    className="w-full h-[88px] resize-none border border-[#dec6a8] bg-[#fffdf9] rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#B8782D]/20"
                  />
                </label>

                <div className="rounded-xl border border-[#e2ccb1] bg-[#fffaf3] px-5 py-4">
                  <div className="flex justify-between text-sm text-[#584536]">
                    <span>Subtotal:</span>
                    <strong>{formatarMoeda(totalForm)}</strong>
                  </div>
                  <div className="flex justify-between text-sm text-[#584536] mt-2">
                    <span>Desconto:</span>
                    <strong>{formatarMoeda(0)}</strong>
                  </div>
                  <div className="border-t border-[#ddc8ad] mt-3 pt-3 flex items-end justify-between gap-3">
                    <span className="font-display text-lg text-[#7f481f]">Total:</span>
                    <strong className="font-display text-[26px] leading-none text-[#8f4f22]">{formatarMoeda(totalForm)}</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 sm:px-8 py-4 border-t border-[#eadfce] bg-[#fffaf3]/80 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="hidden sm:flex items-center gap-2 text-[#9d6a3c] italic font-display text-sm">
                <span className="text-2xl">❧</span>
                Mais que cosméticos, conquistas reais.
              </div>
              <div className="flex items-center gap-3 ml-auto">
                <button
                  type="button"
                  onClick={() => setMostrarForm(false)}
                  className="px-4 py-2 text-sm text-[#5d554f] hover:text-[#2e2118]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm bg-gradient-to-r from-[#9A5B20] to-[#B8782D] text-white rounded-xl shadow-[0_8px_20px_rgba(154,91,32,0.18)] hover:brightness-105 transition"
                >
                  <span>▣</span> Salvar venda
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
