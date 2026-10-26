"use client";

import { useEffect, useId, useRef, useState } from "react";

const chapters = [
  { id: "pedido", label: "Pedido", title: "Un pedido. Sin perder el detalle.",
    text: "Una pizza mitad y mitad, una dirección y una forma de entrega. El recorrido empieza con la misma información para todos.",
    note: "Pedido #149 · Grande · Muzzarella / Napolitana" },
  { id: "cocina", label: "Cocina", title: "La cocina sabe qué sigue.",
    text: "La idea es que el equipo vea qué preparar sin reconstruir el pedido entre mensajes, papeles y otras pantallas.",
    note: "Preparando no significa cobrado." },
  { id: "cobro", label: "Cobro", title: "El comprobante no confirma el cobro.",
    text: "La transferencia tiene su propio estado. Verificar que el dinero llegó es una acción distinta de preparar o entregar el pedido.",
    note: "Transferencia · Pendiente de confirmar" },
  { id: "reparto", label: "Reparto", title: "Entregar no es lo mismo que rendir.",
    text: "Un pedido puede estar entregado mientras la salida del repartidor todavía espera su rendición. Son dos cosas distintas, a la vista.",
    note: "Salida #18 · Juan · Esperando rendición" },
  { id: "cierre", label: "Cierre", title: "El turno, claro. Lo pendiente, también.",
    text: "El recorrido que buscamos conecta lo vendido, lo entregado y lo que falta verificar. Cerrar no debería ser volver a investigar todo el turno.",
    note: "Un mismo pedido. Estados que no se confunden." },
];

export function IllustrativeTurn({ stage }: { stage: number }) {
  const id = useId();
  const chapter = chapters[stage];
  return <figure className="landing-turn" aria-labelledby={id}>
    <div className="landing-turn-top"><strong>qwerty</strong><span>Un turno ilustrativo</span></div>
    <div className="landing-turn-body">
      <p className="landing-eyebrow">{String(stage + 1).padStart(2, "0")} / {chapter.label}</p>
      <div className="landing-order-heading"><h2 id={id}>Pedido #149</h2><span className="landing-badge">{stage === 0 ? "Registrado" : stage < 3 ? "Preparando" : "Entregado"}</span></div>
      <div className="landing-order-item"><div><strong>Pizza mitad y mitad</strong><p>Grande · Muzzarella / Napolitana</p></div><strong>$18.000</strong></div>
      <dl className="landing-state-list">
        <div><dt>Entrega</dt><dd>{stage < 3 ? "Delivery · En preparación" : "Delivery · Entregado"}</dd></div>
        <div className="landing-payment"><dt>Cobro · Transferencia</dt><dd>Pendiente de confirmar</dd></div>
        <div><dt>Salida #18</dt><dd>{stage < 3 ? "Todavía sin asignar" : "Juan · Esperando rendición"}</dd></div>
      </dl>
      <p className="landing-example-note">{chapter.note}</p>
    </div>
    <figcaption>Vista conceptual · Estados e importes ilustrativos</figcaption>
  </figure>;
}

/** Scroll only enhances the example; every chapter and native link exists in SSR. */
export function LandingStory() {
  const [active, setActive] = useState(0);
  const story = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const elements = story.current?.querySelectorAll<HTMLElement>("[data-story-step]");
    if (!elements || typeof IntersectionObserver === "undefined") return;
    let observer: IntersectionObserver | undefined;
    const observe = () => {
      observer?.disconnect();
      // Percentage root margins use width, even vertically. Use height-based pixels.
      const top = Math.floor(window.innerHeight * 0.15);
      const bottom = Math.floor(window.innerHeight * 0.45);
      observer = new IntersectionObserver(entries => {
        const visible = entries.filter(entry => entry.isIntersecting)
          .sort((a, b) => Math.abs(a.boundingClientRect.top - window.innerHeight * 0.3) - Math.abs(b.boundingClientRect.top - window.innerHeight * 0.3));
        const next = Number((visible[0]?.target as HTMLElement | undefined)?.dataset.storyStep);
        if (Number.isInteger(next) && next >= 0 && next < chapters.length) setActive(next);
      }, { rootMargin: `-${top}px 0px -${bottom}px 0px`, threshold: 0 });
      elements.forEach(element => { observer?.observe(element); });
    };
    observe();
    window.addEventListener("resize", observe);
    return () => {
      window.removeEventListener("resize", observe);
      observer?.disconnect();
    };
  }, []);

  return <div className="landing-story" ref={story}>
    <section className="landing-hero" aria-labelledby="hero-title" data-story-step="0">
      <p className="landing-eyebrow">Para gastronómicos que venden directo</p>
      <h1 id="hero-title">Tus pedidos.<br />En orden.</h1>
      <p className="landing-intro">Menos piezas sueltas.<br />Un recorrido más claro para tu equipo.</p>
      <p className="landing-hero-copy">Del pedido al cierre del turno, esta es la operación que estamos construyendo para Qwerty.</p>
      <a className="landing-button landing-primary" href="#como-funciona">Ver el recorrido <span aria-hidden="true">↓</span></a>
      <p className="landing-quiet">Sitio en desarrollo · Vista conceptual</p>
    </section>

    <aside className="landing-preview" aria-label="Vista ilustrativa del turno">
      <div className="landing-preview-sticky">
        <IllustrativeTurn stage={active} />
        <nav className="landing-progress" aria-label="Etapas del recorrido">
          {chapters.map((chapter, index) => <a href={`#${chapter.id}`} key={chapter.id}
            aria-current={active === index ? "step" : undefined} onClick={() => setActive(index)}>
            <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>{chapter.label}
          </a>)}
        </nav>
        <p className="landing-quiet">El ejemplo acompaña la lectura. No son pedidos reales.</p>
      </div>
    </aside>

    <div className="landing-chapters" id="como-funciona">
      <div className="landing-story-intro"><p className="landing-eyebrow">Una misma historia</p><h2>Del pedido al cierre.</h2>
        <p>Seguí un pedido y mirá cómo se relacionan sus estados, sin confundir entrega, cobro y rendición.</p></div>
      <nav className="landing-mobile-progress" aria-label="Recorrido por etapas">
        {chapters.map(chapter => <a key={chapter.id} href={`#${chapter.id}`}>{chapter.label}</a>)}
      </nav>
      {chapters.map((chapter, index) => <section className="landing-chapter" id={chapter.id} key={chapter.id}
        aria-labelledby={`${chapter.id}-title`} data-story-step={index}>
        <p className="landing-eyebrow">{String(index + 1).padStart(2, "0")} / {chapter.label}</p>
        <h2 id={`${chapter.id}-title`}>{chapter.title}</h2><p>{chapter.text}</p>
        <p className="landing-chapter-note">{chapter.note}</p>
        <div className="landing-chapter-example"><IllustrativeTurn stage={index} /></div>
      </section>)}
      <noscript><p>Podés leer todas las etapas sin JavaScript; el ejemplo fijo no cambia con el desplazamiento.</p></noscript>
    </div>
  </div>;
}
