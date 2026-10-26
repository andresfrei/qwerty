import { LandingStory } from "./landing/landing-story";
import "./landing/landing.css";

export default function HomePage() {
  return <main className="qwerty-landing" id="inicio">
    <header className="landing-header">
      <div><a className="landing-brand" href="#inicio" aria-label="Qwerty, inicio">qwerty</a><span className="landing-development">Sitio en desarrollo</span></div>
      <nav aria-label="Navegación principal"><a className="landing-header-link" href="#como-funciona">El recorrido</a><a className="landing-button landing-entry" href="/ingresar">Ingresar</a></nav>
    </header>

    <LandingStory />

    <section className="landing-purpose" aria-labelledby="purpose-title">
      <p className="landing-eyebrow">Para tu venta directa</p>
      <h2 id="purpose-title">Tu negocio. Tu equipo.<br />Una misma información.</h2>
      <p>Qwerty está pensado para pizzerías, casas de empanadas y pequeños locales que ya tienen sus clientes y organizan su propia operación.</p>
      <div className="landing-purpose-points"><p><strong>Lo que llegó.</strong><span>El pedido y sus detalles, sin piezas sueltas.</span></p><p><strong>Lo que sigue.</strong><span>El avance de cocina y entrega, con contexto.</span></p><p><strong>Lo que falta.</strong><span>Cobros y rendiciones pendientes, sin dar nada por confirmado.</span></p></div>
    </section>

    <section className="landing-faq" id="preguntas" aria-labelledby="faq-title">
      <div><p className="landing-eyebrow">Antes de seguir</p><h2 id="faq-title">Las cosas claras.</h2><p>Qué propone Qwerty y qué no deberías dar por hecho.</p></div>
      <div className="landing-faq-items">
        <details><summary>¿Lo que veo es una operación real?</summary><p>No. El recorrido, los pedidos, sus estados y los importes son ilustrativos. Qwerty está en desarrollo; esta landing muestra la experiencia que buscamos construir.</p></details>
        <details><summary>¿Entregado significa cobrado?</summary><p>No. La entrega, la confirmación del pago y la rendición del repartidor tienen estados distintos. Un comprobante no confirma por sí solo que el dinero llegó.</p></details>
        <details><summary>¿Hay comisión de Qwerty por pedido?</summary><p>El modelo propuesto es una suscripción por negocio, sin comisión de Qwerty por pedido. Los proveedores externos podrían aplicar sus propias tarifas. Todavía no publicamos un precio.</p></details>
        <details><summary>¿Qwerty trae clientes o repartidores?</summary><p>No está planteado como un marketplace ni una flota de reparto. El foco es ayudar a organizar la venta directa y la operación del propio negocio.</p></details>
      </div>
    </section>

    <section className="landing-close" aria-labelledby="close-title"><p className="landing-eyebrow">Menos reconstruir. Más claridad.</p><h2 id="close-title">Un turno se entiende mejor<br />cuando podés seguir su historia.</h2><p>Una idea en desarrollo, con los estados y lo pendiente a la vista.</p><a className="landing-button landing-primary" href="#como-funciona">Volver al recorrido <span aria-hidden="true">↑</span></a></section>
    <footer className="landing-footer"><a className="landing-brand" href="#inicio">qwerty</a><p>Vista conceptual · Estados e importes ilustrativos</p><a href="/ingresar">Ingresar</a></footer>
  </main>;
}
