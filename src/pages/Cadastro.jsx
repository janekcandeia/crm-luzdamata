import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { diasDesde, estaAtrasado, formatarData } from '../lib/helpers'

const vazio = {
  nome: '',
  tipo: 'comprador',
  telefone: '',
  email: '',
  cidade: '',
  estado: '',
  bairro: '',
  endereco: '',
  cep: '',
  cnpj: '',
  instagram: '',
  observacoes: '',
  ativo: true,
  data_inativacao: null,
}

export default function Cadastro() {
  const location = useLocation()
  const navigate = useNavigate()
  const { setPageHeader } = useOutletContext()
  const [contatos, setContatos] = useState([])
  const [ultimoContato, setUltimoContato] = useState({}) // { contato_id: dataISO }
  const [visitasMes, setVisitasMes] = useState(0)
  const [aba, setAba] = useState('comprador')
  const [mostrarInativos, setMostrarInativos] = useState(false)
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [form, setForm] = useState(vazio)
  const [editandoId, setEditandoId] = useState(null)
  const [mostrarForm, setMostrarForm] = useState(false)

  useEffect(() => {
    carregar()
  }, [])

  useEffect(() => {
    setPageHeader({
      title: 'Clientes',
      subtitle: 'Compradoras e revendedoras',
      actions: (
        <button
          type="button"
          onClick={() => {
            setForm({ ...vazio, tipo: aba })
            setEditandoId(null)
            setMostrarForm(true)
          }}
          className="inline-flex items-center gap-2 bg-gradient-to-r from-[#9A5B20] to-[#B8782D] text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-[0_8px_20px_rgba(154,91,32,0.20)] hover:brightness-105 transition"
        >
          <span className="text-lg leading-none">+</span> Novo cadastro
        </button>
      ),
    })
    return () => setPageHeader({ title: '', subtitle: '', actions: null })
  }, [setPageHeader, aba])

  // Se chegou aqui vindo do Dashboard (clique em "Ver cliente"),
  // abre direto a ficha de edição do contato indicado.
  useEffect(() => {
    const idParaAbrir = location.state?.editarContatoId
    if (idParaAbrir && contatos.length > 0) {
      const c = contatos.find((x) => x.id === idParaAbrir)
      if (c) {
        setAba(c.tipo)
        abrirEdicao(c)
      }
      navigate(location.pathname, { replace: true, state: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contatos])

  async function carregar() {
    setCarregando(true)
    const { data: cData } = await supabase.from('contatos').select('*').order('nome')
    const { data: vData } = await supabase
      .from('visitas')
      .select('contato_id, data_visita')
      .not('contato_id', 'is', null)
      .order('data_visita', { ascending: false })
    const { data: vendaData } = await supabase
      .from('vendas')
      .select('contato_id, data_venda')
      .order('data_venda', { ascending: false })

    const inicioMes = new Date()
    inicioMes.setDate(1)
    inicioMes.setHours(0, 0, 0, 0)
    const { data: visitasMesData } = await supabase
      .from('visitas')
      .select('id')
      .gte('data_visita', inicioMes.toISOString())
    setVisitasMes(visitasMesData?.length || 0)

    const ultimos = {}
    ;[...(vData || []), ...(vendaData || [])].forEach((r) => {
      const data = r.data_visita || r.data_venda
      if (!ultimos[r.contato_id] || new Date(data) > new Date(ultimos[r.contato_id])) {
        ultimos[r.contato_id] = data
      }
    })

    setContatos(cData || [])
    setUltimoContato(ultimos)
    setCarregando(false)
  }

  function abrirNovo() {
    setForm({ ...vazio, tipo: aba })
    setEditandoId(null)
    setMostrarForm(true)
  }

  function abrirEdicao(c) {
    setForm({ ...c })
    setEditandoId(c.id)
    setMostrarForm(true)
  }

  async function salvar(e) {
    e.preventDefault()
    if (editandoId) {
      await supabase.from('contatos').update(form).eq('id', editandoId)
    } else {
      await supabase.from('contatos').insert(form)
    }
    setMostrarForm(false)
    carregar()
  }

  async function excluir(id) {
    if (!confirm('Excluir este cadastro?')) return
    await supabase.from('contatos').delete().eq('id', id)
    carregar()
  }

  async function alternarAtivo(c) {
    const vaiDesativar = c.ativo !== false
    await supabase
      .from('contatos')
      .update({
        ativo: !vaiDesativar,
        data_inativacao: vaiDesativar ? new Date().toISOString() : null,
      })
      .eq('id', c.id)
    carregar()
  }

  const contatosAtivos = contatos.filter((c) => c.ativo !== false)
  const compradorasAtivas = contatosAtivos.filter((c) => c.tipo === 'comprador').length
  const revendedorasAtivas = contatosAtivos.filter((c) => c.tipo === 'revendedor').length
  const retornosPendentes = contatosAtivos.filter((c) => estaAtrasado(ultimoContato[c.id])).length

  const buscaNormalizada = busca.trim().toLowerCase()
  const listaFiltrada = contatos.filter((c) => {
    if (c.tipo !== aba) return false
    if (!mostrarInativos && c.ativo === false) return false
    if (!buscaNormalizada) return true
    return (
      c.nome?.toLowerCase().includes(buscaNormalizada) ||
      c.telefone?.toLowerCase().includes(buscaNormalizada) ||
      c.cidade?.toLowerCase().includes(buscaNormalizada)
    )
  })

  return (
    <div className="w-full pb-3 space-y-[1px]">

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-[5px]">
        <div className="bg-white/90 border border-[#eadfce] rounded-2xl px-5 py-3 shadow-[0_10px_30px_rgba(77,45,18,0.05)] flex items-center gap-2 xl:h-[80px]">
          <p className="text-xs text-mata-ink/50 uppercase tracking-wide">Compradoras ativas</p>
          <p className="font-display text-2xl text-mata-ink mt-1">{compradorasAtivas}</p>
        </div>
        <div className="bg-white/90 border border-[#eadfce] rounded-2xl px-5 py-3 shadow-[0_10px_30px_rgba(77,45,18,0.05)] flex items-center gap-2 xl:h-[80px]">
          <p className="text-xs text-mata-ink/50 uppercase tracking-wide">Revendedoras ativas</p>
          <p className="font-display text-2xl text-mata-ink mt-1">{revendedorasAtivas}</p>
        </div>
        <div className="bg-white/90 border border-[#eadfce] rounded-2xl px-5 py-3 shadow-[0_10px_30px_rgba(77,45,18,0.05)] flex items-center gap-2 xl:h-[80px]">
          <p className="text-xs text-mata-ink/50 uppercase tracking-wide">Visitas do mês</p>
          <p className="font-display text-2xl text-mata-ink mt-1">{visitasMes}</p>
        </div>
        <div className="bg-white/90 border border-[#eadfce] rounded-2xl px-5 py-3 shadow-[0_10px_30px_rgba(77,45,18,0.05)] flex items-center gap-2 xl:h-[80px]">
          <p className="text-xs text-mata-ink/50 uppercase tracking-wide">Retornos pendentes</p>
          <p className="font-display text-2xl text-red-600 mt-1">{retornosPendentes}</p>
        </div>
      </section>

      <section className="flex items-center justify-between border-b border-[#eadfce] bg-white/80 rounded-t-2xl px-2">
        <div className="flex gap-1">
          {['comprador', 'revendedor'].map((t) => (
            <button
              key={t}
              onClick={() => setAba(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                aba === t ? 'border-mata-copper text-mata-copper' : 'border-transparent text-mata-ink/50'
              }`}
            >
              {t === 'comprador' ? 'Compradoras' : 'Revendedoras'}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-mata-ink/50 pb-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={mostrarInativos}
            onChange={(e) => setMostrarInativos(e.target.checked)}
          />
          Mostrar inativos
        </label>
      </section>

      <section className="bg-white/90 border border-[#eadfce] rounded-2xl px-4 py-2 shadow-[0_8px_26px_rgba(77,45,18,0.04)]">
        <input
          type="text"
          placeholder="Localizar por nome, telefone ou cidade..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-full sm:w-96 border border-[#eadfce] bg-[#fffdfa] rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#B8782D]/20"
        />
      </section>

      {carregando ? (
        <p className="text-mata-ink/50 text-sm">Carregando…</p>
      ) : listaFiltrada.length === 0 ? (
        <p className="text-mata-ink/50 text-sm">
          {busca ? 'Nenhum resultado para essa busca.' : 'Nenhum cadastro ainda nesta categoria.'}
        </p>
      ) : (
        <div className="bg-white/90 border border-[#eadfce] rounded-2xl shadow-[0_8px_26px_rgba(77,45,18,0.04)] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#f8f1e7] text-mata-ink/60 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3">Nome</th>
                <th className="text-left px-4 py-3">Contato</th>
                <th className="text-left px-4 py-3">Cidade</th>
                <th className="text-left px-4 py-3">Último contato</th>
                <th className="text-right px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {listaFiltrada.map((c) => {
                const ultima = ultimoContato[c.id]
                const atrasado = estaAtrasado(ultima)
                const inativo = c.ativo === false
                return (
                  <tr key={c.id} className={`border-t border-mata-sand/70 ${inativo ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-medium">
                      {c.nome}
                      {inativo && (
                        <span className="ml-2 inline-block text-[10px] bg-mata-sand text-mata-ink/60 px-2 py-0.5 rounded-full">
                          Inativo{c.data_inativacao ? ` desde ${formatarData(c.data_inativacao)}` : ''}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-mata-ink/70">{c.telefone || c.email || '—'}</td>
                    <td className="px-4 py-3 text-mata-ink/70">{c.cidade || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={atrasado ? 'text-red-600 font-medium' : 'text-mata-ink/70'}>
                        {ultima ? `${formatarData(ultima)} (${diasDesde(ultima)}d)` : 'Sem registro'}
                      </span>
                      {atrasado && (
                        <span className="ml-2 inline-block text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                          +30 dias
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right space-x-3">
                      <button onClick={() => abrirEdicao(c)} className="text-mata-copper hover:underline">
                        Editar
                      </button>
                      <button onClick={() => alternarAtivo(c)} className="text-mata-ink/50 hover:underline">
                        {inativo ? 'Ativar' : 'Desativar'}
                      </button>
                      <button onClick={() => excluir(c.id)} className="text-mata-ink/40 hover:text-red-600">
                        Excluir
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {mostrarForm && (
        <div className="fixed inset-0 bg-[#1d120b]/45 backdrop-blur-[2px] flex items-center justify-center p-4 sm:p-6 z-50">
          <form onSubmit={salvar} className="bg-[#fffdfa] border border-[#eadfce] rounded-2xl p-5 sm:p-6 w-full max-w-md space-y-4 shadow-2xl">
            <h3 className="font-display text-xl">{editandoId ? 'Editar cadastro' : 'Novo cadastro'}</h3>

            <div className="flex gap-2">
              {['comprador', 'revendedor'].map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setForm({ ...form, tipo: t })}
                  className={`flex-1 py-2 rounded-lg text-sm border ${
                    form.tipo === t
                      ? 'bg-mata-copper text-white border-mata-copper'
                      : 'border-mata-sand text-mata-ink/60'
                  }`}
                >
                  {t === 'comprador' ? 'Compradora' : 'Revendedora'}
                </button>
              ))}
            </div>

            <input
              required
              placeholder="Nome"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              className="w-full border border-[#eadfce] rounded-xl px-3 py-2 text-sm"
            />
            <input
              placeholder="Telefone"
              value={form.telefone}
              onChange={(e) => setForm({ ...form, telefone: e.target.value })}
              className="w-full border border-[#eadfce] rounded-xl px-3 py-2 text-sm"
            />
            <input
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full border border-[#eadfce] rounded-xl px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <input
                placeholder="Cidade"
                value={form.cidade}
                onChange={(e) => setForm({ ...form, cidade: e.target.value })}
                className="flex-1 border border-[#eadfce] rounded-xl px-3 py-2 text-sm"
              />
              <input
                placeholder="Estado"
                value={form.estado}
                onChange={(e) => setForm({ ...form, estado: e.target.value })}
                className="w-24 border border-[#eadfce] rounded-xl px-3 py-2 text-sm"
              />
            </div>

            <div className="flex gap-2">
              <input
                placeholder="Bairro"
                value={form.bairro}
                onChange={(e) => setForm({ ...form, bairro: e.target.value })}
                className="flex-1 border border-[#eadfce] rounded-xl px-3 py-2 text-sm"
              />
              <input
                placeholder="CEP"
                value={form.cep}
                onChange={(e) => setForm({ ...form, cep: e.target.value })}
                className="w-32 border border-[#eadfce] rounded-xl px-3 py-2 text-sm"
              />
            </div>

            <input
              placeholder="Endereço"
              value={form.endereco}
              onChange={(e) => setForm({ ...form, endereco: e.target.value })}
              className="w-full border border-[#eadfce] rounded-xl px-3 py-2 text-sm"
            />

            {form.tipo === 'revendedor' && (
              <div className="flex gap-2">
                <input
                  placeholder="CNPJ"
                  value={form.cnpj}
                  onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                  className="flex-1 border border-[#eadfce] rounded-xl px-3 py-2 text-sm"
                />
                <input
                  placeholder="Instagram"
                  value={form.instagram}
                  onChange={(e) => setForm({ ...form, instagram: e.target.value })}
                  className="flex-1 border border-[#eadfce] rounded-xl px-3 py-2 text-sm"
                />
              </div>
            )}

            <textarea
              placeholder="Observações"
              value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              className="w-full border border-[#eadfce] rounded-xl px-3 py-2 text-sm"
              rows={3}
            />

            {editandoId && (
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-mata-ink/70 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.ativo !== false}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        ativo: e.target.checked,
                        data_inativacao: e.target.checked
                          ? null
                          : form.data_inativacao || new Date().toISOString(),
                      })
                    }
                  />
                  Cadastro ativo
                </label>

                {form.ativo === false && (
                  <div>
                    <label className="text-xs text-mata-ink/60">Inativo desde</label>
                    <input
                      type="date"
                      value={(form.data_inativacao || new Date().toISOString()).slice(0, 10)}
                      onChange={(e) => setForm({ ...form, data_inativacao: e.target.value })}
                      className="w-full border border-[#eadfce] rounded-xl px-3 py-2 text-sm mt-1"
                    />
                    <p className="text-[11px] text-mata-ink/40 mt-1">
                      Vendas e visitas até essa data continuam contando no Dashboard.
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMostrarForm(false)}
                className="px-4 py-2 text-sm text-mata-ink/60"
              >
                Cancelar
              </button>
              <button type="submit" className="px-4 py-2 text-sm bg-gradient-to-r from-[#9A5B20] to-[#B8782D] text-white rounded-xl shadow-[0_8px_20px_rgba(154,91,32,0.18)] hover:brightness-105 transition">
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
