const orders = [
  {
    number: "#142",
    name: "Pizza mitad y mitad",
    detail: "Grande · Muzzarella / Napolitana",
    amount: "$18.000",
    status: "Preparando",
    statusColor: "text-[var(--transfer-text)]",
  },
  {
    number: "#145",
    name: "Docena de empanadas",
    detail: "Carne 4 · Pollo 4 · JyQ 4",
    amount: "$23.500",
    status: "Lista para salir",
    statusColor: "text-[var(--success)]",
  },
];

const problems = [
  { label: "01 / PEDIDO", title: "Llegó por mensaje.", detail: "¿Ya quedó anotado?" },
  { label: "02 / COCINA", title: "¿Qué pedido sigue?", detail: "Otra nota, otra pantalla." },
  { label: "03 / COBRO", title: "¿Esta transferencia entró?", detail: "El comprobante no alcanza." },
];

const flowSteps = [
  {
    label: "01 / PEDIDO",
    title: "Pedido #149",
    detail: "Pizza grande · Delivery",
    status: "Registrado",
    statusClass: "bg-[var(--soft-lime)] text-[var(--olive)]",
  },
  {
    label: "02 / COCINA",
    title: "En preparación",
    detail: "El equipo sabe qué sigue.",
    status: "Preparando",
    statusClass: "bg-[var(--transfer-bg)] text-[var(--transfer-text)]",
  },
  {
    label: "03 / ENTREGA",
    title: "Repartidor asignado",
    detail: "Sabés quién lleva el pedido.",
    status: "Juan · Salida #18",
    statusClass: "bg-[#eef0eb] text-[var(--body-subtle)]",
  },
  {
    label: "04 / CIERRE",
    title: "Todo queda a la vista",
    detail: "Lo vendido, cobrado y pendiente.",
    status: "Cierre del turno",
    statusClass: "bg-[#eef0eb] text-[var(--body-subtle)]",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen px-6 py-6 sm:px-10 sm:py-8 lg:px-16">
      <header className="mx-auto flex max-w-7xl items-center justify-between">
        <span className="text-[1.55rem] font-[750] tracking-[-0.08em]">qwerty</span>
        <p className="inline-flex items-center gap-[0.45rem] text-[0.7rem] font-bold tracking-[0.02em] text-[var(--muted)]">
          <span className="inline-block size-[0.45rem] rounded-full bg-[var(--lime)]" aria-hidden="true" />
          Sitio en desarrollo
        </p>
      </header>

      <section
        className="mx-auto block max-w-7xl pt-[4.5rem] md:grid md:min-h-[calc(100vh-5rem)] md:grid-cols-[minmax(0,0.9fr)_minmax(27rem,1.1fr)] md:items-center md:gap-14 md:pb-20 md:pt-[clamp(4rem,10vh,8rem)] lg:grid-cols-[minmax(0,0.82fr)_minmax(31rem,1.18fr)] lg:gap-[clamp(3rem,8vw,8rem)]"
        aria-labelledby="hero-title"
      >
        <div className="max-w-none md:max-w-[33rem]">
          <p className="inline-flex items-center gap-[0.65rem] rounded-[0.45rem] bg-[var(--soft-lime)] px-[0.8rem] py-[0.55rem] text-[0.68rem] font-extrabold uppercase tracking-[0.04em] text-[var(--olive)]">
            <span className="text-[0.55rem] text-[var(--olive)]" aria-hidden="true">
              ●
            </span>
            Para gastronómicos que venden directo
          </p>
          <h1
            id="hero-title"
            className="mb-4 mt-[2.2rem] text-[clamp(3.35rem,17vw,4.7rem)] font-[750] leading-[0.94] tracking-[-0.095em] md:mt-10 md:text-[clamp(3.5rem,6.4vw,6.25rem)]"
          >
            Tus pedidos.
            <br />
            En orden.
          </h1>
          <p className="mb-[1.7rem] max-w-[28rem] text-[1rem] leading-[1.45] tracking-[-0.025em] text-[var(--body-subtle)] md:max-w-[31rem] md:text-[clamp(1rem,1.5vw,1.25rem)]">
            Del pedido al cierre, controlá ventas directas, cocina, cobros y delivery desde un solo
            lugar.
          </p>
          <p className="inline-flex max-w-full items-start gap-[0.7rem] rounded-[0.5rem] bg-[var(--soft-lime)] px-[0.85rem] py-[0.7rem] text-[0.8rem] leading-[1.35] text-[var(--olive)] md:max-w-[28rem]">
            <span className="text-[1rem] font-extrabold" aria-hidden="true">
              ✓
            </span>
            <span>
              <strong className="block text-[0.85rem]">Sin comisión de Qwerty por pedido</strong>
              <small className="mt-1 block text-[0.68rem] text-[var(--olive-muted)]">
                Modelo propuesto: los proveedores externos podrían aplicar sus propias tarifas.
              </small>
            </span>
          </p>
          <a
            className="mt-7 inline-flex items-center rounded-[0.55rem] border border-[var(--olive)] px-4 py-3 text-[0.78rem] font-extrabold text-[var(--olive)] transition-colors hover:bg-[var(--soft-lime)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--olive)]"
            href="#como-funciona"
          >
            Ver cómo funciona <span className="ml-2 text-[1rem]" aria-hidden="true">↓</span>
          </a>
        </div>

        <section className="mt-14 grid gap-4 md:mt-0" aria-labelledby="examples-title">
          <h2 id="examples-title" className="sr-only">
            Ejemplos ilustrativos de pedidos y estados operativos
          </h2>
          <article className="overflow-hidden rounded-[1.15rem] border border-[var(--line)] bg-white shadow-[0_1.5rem_3rem_rgb(40_47_37_/_9%)]">
            <header className="flex items-center justify-between border-b border-[#eeeeea] px-4 py-[1.1rem] md:px-[1.35rem] md:py-[1.2rem]">
              <div className="flex items-center gap-[0.45rem] text-[0.72rem] text-[var(--muted)]">
                <span className="inline-block size-[0.55rem] rounded-[0.15rem] bg-[var(--lime)]" aria-hidden="true" />
                <strong className="text-[0.95rem] text-[var(--ink)]">qwerty</strong>
                <span aria-hidden="true">/</span>
                <span>pedidos</span>
              </div>
              <span className="text-[0.66rem] text-[var(--muted)]">Turno de hoy</span>
            </header>
            <div className="px-4 pb-4 pt-[1.35rem] md:px-[1.35rem] md:pb-[1.35rem] md:pt-[1.65rem]">
              <div className="mb-[1.2rem] flex items-end justify-between gap-4">
                <div>
                  <p className="mb-[0.4rem] text-[0.66rem] uppercase text-[var(--muted)]">Viernes · 20:42</p>
                  <h2 className="m-0 text-[1.25rem] font-[750] tracking-[-0.045em]">Pedidos en curso</h2>
                </div>
                <span className="whitespace-nowrap rounded-[0.45rem] bg-[var(--soft-lime)] px-[0.6rem] py-[0.4rem] text-[0.65rem] font-extrabold text-[var(--olive)]">
                  6 activos
                </span>
              </div>
              <div className="grid gap-[0.9rem]">
                {orders.map((order) => (
                  <div
                    className="flex items-start justify-between gap-4 rounded-[0.8rem] bg-[#f7f7f4] p-[0.9rem] md:items-center md:p-4"
                    key={order.number}
                  >
                    <div className="min-w-0">
                      <strong className="block overflow-hidden text-ellipsis whitespace-nowrap text-[0.78rem] font-[750] tracking-[-0.025em] md:text-[0.85rem]">
                        {order.number} · {order.name}
                      </strong>
                      <span className="mt-[0.3rem] block overflow-hidden text-ellipsis whitespace-nowrap text-[0.61rem] text-[var(--muted)] md:text-[0.66rem]">
                        {order.detail}
                      </span>
                    </div>
                    <div className="shrink-0 text-right">
                      <strong className="text-[0.8rem]">{order.amount}</strong>
                      <span
                        className={`mt-1 block text-[0.66rem] font-[750] ${order.statusColor}`}
                      >
                        {order.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-[0.9rem] flex flex-col items-start gap-[0.35rem] rounded-[0.6rem] bg-[var(--transfer-bg)] px-4 py-[0.8rem] text-[0.68rem] text-[var(--transfer-text)] md:flex-row md:items-center md:justify-between md:gap-4">
                <span>
                  Pedido #149 <span aria-hidden="true">·</span> Transferencia
                </span>
                <strong className="text-left text-[0.67rem] text-[var(--transfer-text)] md:text-right">
                  Pendiente de confirmar
                </strong>
              </div>
            </div>
          </article>

          <article className="w-[calc(100%-1rem)] max-w-[20rem] justify-self-end rounded-[1rem] bg-[var(--forest)] p-5 text-white shadow-[0_1.5rem_2.5rem_rgb(32_61_44_/_20%)]">
            <div className="flex items-center justify-between gap-3 border-b border-white/15 pb-3">
              <h2 className="m-0 text-[0.85rem] font-[750]">Juan · Salida #18</h2>
              <span className="whitespace-nowrap text-[0.66rem] text-[var(--forest-muted)]">3/3 entregados</span>
            </div>
            <div className="pt-3.5">
              <p className="mb-[0.4rem] text-[0.66rem] uppercase text-[var(--forest-label)]">Debe rendir</p>
              <div className="flex items-end justify-between gap-3">
                <strong className="text-[1.8rem] leading-none tracking-[-0.06em]">$55.500</strong>
                <span className="rounded-[0.4rem] bg-[var(--settlement-bg)] px-[0.55rem] py-[0.45rem] text-[0.62rem] font-extrabold text-[var(--settlement-text)]">
                  Esperando rendición
                </span>
              </div>
            </div>
          </article>
          <p className="justify-self-start text-[0.65rem] text-[var(--muted)] md:justify-self-end">
            Vista conceptual · importes ilustrativos
          </p>
        </section>
      </section>

      <section
        className="-mx-6 bg-[#f1f0e9] px-6 py-20 sm:-mx-10 sm:px-10 sm:py-24 lg:-mx-16 lg:px-16 lg:py-28"
        aria-labelledby="problem-title"
      >
        <div className="mx-auto max-w-7xl">
          <p className="mb-5 inline-flex items-center gap-2 text-[0.68rem] font-extrabold uppercase tracking-[0.04em] text-[var(--olive)]">
            <span className="text-[0.55rem]" aria-hidden="true">●</span>
            El problema
          </p>
          <h2
            id="problem-title"
            className="max-w-[58rem] text-[clamp(2.45rem,6vw,4.2rem)] font-[750] leading-[0.98] tracking-[-0.085em]"
          >
            Vender no debería terminar en hacer cuentas.
          </h2>
          <p className="mt-5 max-w-[48rem] text-[1rem] leading-[1.5] tracking-[-0.02em] text-[var(--body-subtle)] md:text-[1.1rem]">
            Pedidos por un lado. Transferencias por otro. Efectivo con los repartidores. Al final del
            turno, alguien tiene que reconstruir qué pasó.
          </p>

          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {problems.map((problem) => (
              <article
                className="rounded-[0.9rem] border border-[var(--line)] bg-white p-5 sm:p-6"
                key={problem.label}
              >
                <p className="text-[0.65rem] font-extrabold uppercase text-[var(--muted)]">{problem.label}</p>
                <h3 className="mt-4 text-[1.2rem] font-[750] tracking-[-0.04em]">{problem.title}</h3>
                <p className="mt-3 text-[0.78rem] leading-[1.4] text-[var(--muted)]">{problem.detail}</p>
              </article>
            ))}
          </div>

          <div className="mt-8 flex flex-col gap-4 text-[0.78rem] leading-[1.4] text-[var(--body-subtle)] sm:flex-row sm:items-center sm:justify-between">
            <p>Si cada dato vive en un lugar distinto, cerrar el turno se vuelve una investigación.</p>
            <a
              className="font-extrabold text-[var(--olive)] underline decoration-[var(--lime)] decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--olive)]"
              href="#como-funciona"
            >
              Qwerty conecta el recorrido <span aria-hidden="true">↓</span>
            </a>
          </div>
        </div>
      </section>

      <section
        id="como-funciona"
        className="scroll-mt-6 px-0 py-20 sm:py-24 lg:py-28"
        aria-labelledby="flow-title"
      >
        <div className="mx-auto max-w-7xl">
          <p className="mb-5 inline-flex items-center gap-2 text-[0.68rem] font-extrabold uppercase tracking-[0.04em] text-[var(--olive)]">
            <span className="text-[0.55rem]" aria-hidden="true">●</span>
            Una misma historia
          </p>
          <h2
            id="flow-title"
            className="text-[clamp(2.7rem,6vw,4.2rem)] font-[750] leading-[0.98] tracking-[-0.085em]"
          >
            Del pedido al cierre.
          </h2>
          <p className="mt-5 max-w-[42rem] text-[1rem] leading-[1.5] tracking-[-0.02em] text-[var(--body-subtle)] md:text-[1.1rem]">
            Un pedido, visible para el equipo. Cada paso deja de depender de notas sueltas.
          </p>

          <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {flowSteps.map((step, index) => (
              <article
                className="relative rounded-[0.9rem] border border-[var(--line)] bg-white p-5 sm:p-6"
                key={step.label}
              >
                {index === 0 && (
                  <span className="absolute right-5 top-6 size-[0.45rem] rounded-full bg-[var(--lime)]" aria-hidden="true" />
                )}
                <p className="text-[0.65rem] font-extrabold uppercase text-[var(--olive)]">{step.label}</p>
                <h3 className="mt-5 text-[1.15rem] font-[750] tracking-[-0.04em]">{step.title}</h3>
                <p className="mt-3 min-h-[2.2rem] text-[0.78rem] leading-[1.4] text-[var(--muted)]">{step.detail}</p>
                <span className={`mt-5 inline-flex rounded-[0.4rem] px-2 py-1 text-[0.65rem] font-extrabold ${step.statusClass}`}>
                  {step.status}
                </span>
              </article>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-2 rounded-[0.9rem] bg-[var(--transfer-bg)] px-5 py-4 text-[0.75rem] text-[var(--transfer-text)] sm:flex-row sm:items-center sm:gap-5 sm:px-6">
            <strong className="font-extrabold">Cobro del pedido #149</strong>
            <span>Transferencia · Pendiente de confirmar</span>
            <span className="sm:ml-auto sm:text-right">Se verifica por separado.</span>
          </div>
          <p className="mt-4 text-[0.65rem] text-[var(--muted)]">Vista conceptual · Estados e importes ilustrativos</p>
        </div>
      </section>
    </main>
  );
}
