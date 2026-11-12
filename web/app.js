(function () {
  'use strict';

  var MESES_LARGO = { abr: 'abril', may: 'mayo', jun: 'junio', jul: 'julio', ago: 'agosto', sep: 'septiembre' };
  var ETIQUETA = { verde: 'Verde', ambar: 'Ámbar', rojo: 'Rojo' };
  var ORDEN = { rojo: 0, ambar: 1, verde: 2 };
  var SVG_NS = 'http://www.w3.org/2000/svg';

  var D = null;
  var filtro = { mes: 'sep', seg: 'todos', estado: 'todos', todosSeg: false };
  var orden = { col: -1, dir: 1 };
  var raiz = document.documentElement;
  raiz.classList.add('js');

  var REDUCE = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  function quieto() { return REDUCE.matches; }

  // ---------- Utilidades de DOM (solo textContent, nunca HTML) ----------

  function $(id) { return document.getElementById(id); }
  function vaciar(n) { while (n.firstChild) { n.removeChild(n.firstChild); } }

  function el(tag, clase, texto) {
    var n = document.createElement(tag);
    if (clase) { n.className = clase; }
    if (texto !== undefined && texto !== null) { n.textContent = texto; }
    return n;
  }

  function sv(tag, atributos, texto) {
    var n = document.createElementNS(SVG_NS, tag);
    if (atributos) {
      Object.keys(atributos).forEach(function (k) { n.setAttribute(k, String(atributos[k])); });
    }
    if (texto !== undefined && texto !== null) { n.textContent = texto; }
    return n;
  }

  function mayus(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // Cambia un texto y lo hace aparecer con un fundido corto (Web Animations, solo opacidad).
  function texto(id, t) {
    var n = typeof id === 'string' ? $(id) : id;
    if (n.textContent === t) { return; }
    n.textContent = t;
    if (!quieto() && n.animate) {
      n.animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 500, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    }
  }

  // ---------- Formato ----------

  var nf = new Intl.NumberFormat('es-MX');
  function pct(v, d) {
    var dec = d === undefined ? 1 : d;
    return v.toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + '%';
  }
  function millones(v) { return (v / 1e6).toLocaleString('es-MX', { maximumFractionDigits: 0 }); }
  function entero(v) { return nf.format(Math.round(v)); }
  function parte(a, b) { return b ? 100 * a / b : 0; }
  function nombreSeg(id) {
    for (var i = 0; i < D.segmentos.length; i++) { if (D.segmentos[i].id === id) { return D.segmentos[i].nombre; } }
    return id;
  }
  function mesAnterior(mes) {
    var i = D.meta.meses.indexOf(mes);
    return i > 0 ? D.meta.meses[i - 1] : null;
  }

  // ---------- Movimiento ----------

  function lerp(a, b, t) { return a + (b - a) * t; }
  function acotar(t) { return t < 0 ? 0 : (t > 1 ? 1 : t); }
  function suavizar(t) { var u = 1 - acotar(t); return 1 - u * u * u * u; }

  function mezclar(a, b, t) {
    if (typeof a === 'number') { return lerp(a, b, t); }
    return a.map(function (x, i) { return mezclar(x, b[i], t); });
  }

  // Ejecuta paso(t) con t de 0 a 1 en dur milisegundos. Devuelve una función que cancela.
  function animar(dur, paso, fin) {
    if (quieto() || dur <= 0) {
      paso(1);
      if (fin) { fin(); }
      return function () {};
    }
    var inicio = null;
    var id = 0;
    var vivo = true;
    function cuadro(ts) {
      if (!vivo) { return; }
      if (inicio === null) { inicio = ts; }
      var t = acotar((ts - inicio) / dur);
      paso(t);
      if (t < 1) { id = requestAnimationFrame(cuadro); } else if (fin) { fin(); }
    }
    paso(0);
    id = requestAnimationFrame(cuadro);
    return function () { vivo = false; cancelAnimationFrame(id); };
  }

  // Observador compartido: ejecuta fn una sola vez cuando el nodo entra en pantalla.
  var vigilados = [];
  var observador = null;
  function alVer(nodo, fn) {
    if (!('IntersectionObserver' in window)) { fn(); return; }
    if (!observador) {
      observador = new IntersectionObserver(function (entradas) {
        entradas.forEach(function (e) {
          if (!e.isIntersecting) { return; }
          observador.unobserve(e.target);
          for (var i = vigilados.length - 1; i >= 0; i--) {
            if (vigilados[i].n === e.target) { var f = vigilados[i].f; vigilados.splice(i, 1); f(); }
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    }
    vigilados.push({ n: nodo, f: fn });
    observador.observe(nodo);
  }

  // Contador animado: interpola entre el valor mostrado y el nuevo. El texto final queda en un nodo para lectores de pantalla.
  function contador(nodo, fmt) {
    var sr = el('span', 'solo-lectores');
    nodo.parentNode.insertBefore(sr, nodo.nextSibling);
    nodo.setAttribute('aria-hidden', 'true');
    var actual = 0;
    var destino = null;
    var visto = false;
    var cancelar = null;
    function pintar(v) { nodo.textContent = fmt(v); }
    function ir(desde, dur) {
      if (cancelar) { cancelar(); }
      var meta = destino;
      cancelar = animar(dur, function (t) { actual = lerp(desde, meta, suavizar(t)); pintar(actual); });
    }
    pintar(0);
    var c = {
      poner: function (v, alterno) {
        if (cancelar) { cancelar(); cancelar = null; }
        if (v === null) {
          destino = null;
          nodo.textContent = alterno;
          sr.textContent = alterno;
          return;
        }
        var desde = destino === null ? 0 : actual;
        destino = v;
        sr.textContent = fmt(v);
        if (quieto()) { actual = v; pintar(v); return; }
        if (!visto) { actual = 0; pintar(0); return; }
        ir(desde, 750);
      },
      ver: function () {
        visto = true;
        if (destino !== null && !quieto()) { actual = 0; ir(0, 1400); }
      }
    };
    alVer(nodo, c.ver);
    return c;
  }

  // ---------- Componentes ----------

  function tabla(caption, cabeceras, filas, numericas) {
    var t = el('table');
    t.appendChild(el('caption', null, caption));
    var cab = el('thead');
    var fc = el('tr');
    cabeceras.forEach(function (c, i) {
      var th = el('th', numericas.indexOf(i) >= 0 ? 'num' : '', c);
      th.setAttribute('scope', 'col');
      fc.appendChild(th);
    });
    cab.appendChild(fc);
    t.appendChild(cab);
    var cuerpo = el('tbody');
    filas.forEach(function (f) {
      var tr = el('tr');
      f.forEach(function (c, i) {
        if (i === 0) {
          var th = el('th', null, c);
          th.setAttribute('scope', 'row');
          tr.appendChild(th);
        } else {
          tr.appendChild(el('td', numericas.indexOf(i) >= 0 ? 'num' : '', c));
        }
      });
      cuerpo.appendChild(tr);
    });
    t.appendChild(cuerpo);
    return t;
  }

  function leyenda(ul, items) {
    vaciar(ul);
    items.forEach(function (it) {
      var li = el('li');
      var m = el('span', 'muestra ' + it.clase + (it.linea ? ' linea' : ''));
      m.setAttribute('aria-hidden', 'true');
      li.appendChild(m);
      li.appendChild(el('span', null, it.nombre));
      ul.appendChild(li);
    });
  }

  function semaforo(estado) {
    var s = el('span', 'semaforo ' + estado);
    s.appendChild(el('span', null, ETIQUETA[estado]));
    return s;
  }

  function techoLimpio(max) {
    var pasos = [5, 10, 20, 25, 30, 40, 50, 60, 80, 100];
    for (var i = 0; i < pasos.length; i++) { if (max <= pasos[i]) { return pasos[i]; } }
    return 100;
  }

  // ---------- Gráficas en SVG ----------

  var uid = 0;
  var graficas = [];

  // Motor común: monta el SVG, interpola entre estados y reconstruye al cambiar el ancho.
  function crearGrafica(cont, fabrica, opc) {
    var g = { visto: false, ctx: null, actual: null, destino: null, cancelar: null, meta: null, svg: null, cont: cont };
    function montar() {
      var w = Math.max(opc.min, cont.clientWidth || 320);
      if (g.svg) { cont.removeChild(g.svg); }
      g.ctx = fabrica(cont, w, g.meta);
      g.svg = g.ctx.svg;
      cont.insertBefore(g.svg, cont.firstChild);
      if (g.visto) { g.svg.classList.add('listo'); }
    }
    g.poner = function (destino, meta) {
      g.meta = meta;
      g.destino = destino;
      if (!g.ctx) { montar(); } else { g.ctx.meta(meta); }
      if (g.cancelar) { g.cancelar(); g.cancelar = null; }
      if (!g.visto && opc.crecer) { g.actual = opc.cero(destino); g.ctx.render(g.actual); return; }
      if (!g.visto || !g.actual || quieto()) { g.actual = destino; g.ctx.render(destino); return; }
      var desde = g.actual;
      var ctx = g.ctx;
      g.cancelar = animar(opc.dur || 800, function (t) {
        g.actual = ctx.interp(desde, destino, t);
        ctx.render(g.actual);
      }, function () { g.actual = destino; ctx.render(destino); });
    };
    g.ver = function () {
      g.visto = true;
      if (!opc.crecer || !g.ctx || !g.destino) { return; }
      if (g.cancelar) { g.cancelar(); }
      var ctx = g.ctx;
      var desde = opc.cero(g.destino);
      var destino = g.destino;
      g.cancelar = animar(1300, function (t) {
        g.actual = ctx.interp(desde, destino, t);
        ctx.render(g.actual);
      }, function () { g.actual = destino; ctx.render(destino); });
    };
    g.redimensionar = function () {
      if (!g.ctx) { return; }
      var w = Math.max(opc.min, cont.clientWidth || 320);
      if (Math.abs(w - g.ctx.w) < 2) { return; }
      if (g.cancelar) { g.cancelar(); g.cancelar = null; }
      montar();
      g.actual = (!g.visto && opc.crecer) ? opc.cero(g.destino) : g.destino;
      g.ctx.render(g.actual);
    };
    alVer(cont, g.ver);
    graficas.push(g);
    return g;
  }

  function crearTip(cont) {
    var tip = el('div', 'tip');
    tip.id = 'tip-' + cont.id;
    tip.setAttribute('role', 'tooltip');
    tip.setAttribute('aria-live', 'polite');
    tip.appendChild(el('p', 'tip-t'));
    for (var i = 0; i < 3; i++) {
      var f = el('p', 'tip-f');
      f.appendChild(el('span'));
      f.appendChild(el('span'));
      tip.appendChild(f);
    }
    cont.appendChild(tip);
    cont.setAttribute('aria-describedby', tip.id);
    return tip;
  }

  // Líneas: estado { v: [serie][mes], techo, s } donde s es la posición (decimal) del mes seleccionado.
  function fabricaLineas(cont, w, meta) {
    var tip = cont.querySelector('.tip') || crearTip(cont);
    var h = 250;
    var m = { l: 42, r: 50, t: 16, b: 30 };
    var n = meta.cats.length;
    var x0 = m.l + 34;
    var x1 = w - m.r;
    var paso = (x1 - x0) / (n - 1);
    var id = ++uid;
    var s = sv('svg', { viewBox: '0 0 ' + w + ' ' + h, role: 'img', 'aria-label': meta.desc });
    var titulo = sv('title', null, meta.desc);
    s.appendChild(titulo);

    var defs = sv('defs');
    var grad = sv('linearGradient', { id: 'grad-' + id, x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.appendChild(sv('stop', { class: 'degradado-pie', offset: 0, 'stop-opacity': 0.18 }));
    grad.appendChild(sv('stop', { class: 'degradado-pie', offset: 1, 'stop-opacity': 0 }));
    defs.appendChild(grad);
    var clip = sv('clipPath', { id: 'clip-' + id });
    clip.appendChild(sv('rect', { class: 'clip-rect', x: -12, y: -12, width: w + 24, height: h + 24 }));
    defs.appendChild(clip);
    s.appendChild(defs);

    var rejilla = [];
    var ejeY = [];
    var i;
    for (i = 0; i <= 5; i++) {
      var ln = sv('line', { class: i === 0 ? 'eje' : 'rejilla-g', x1: m.l, x2: w - m.r });
      var tx = sv('text', { class: 'suave', x: m.l - 6, 'text-anchor': 'end' });
      s.appendChild(ln); s.appendChild(tx);
      rejilla.push(ln); ejeY.push(tx);
    }
    var banda = sv('rect', { class: 'fondo-mes', y: m.t, width: paso, height: h - m.t - m.b });
    s.insertBefore(banda, s.children[1]);
    meta.cats.forEach(function (c, j) {
      s.appendChild(sv('text', { class: 'suave', x: x0 + j * paso, y: h - 8, 'text-anchor': 'middle' }, c));
    });

    var gl = sv('g', { 'clip-path': 'url(#clip-' + id + ')' });
    var area = sv('path', { class: 'area', fill: 'url(#grad-' + id + ')' });
    gl.appendChild(area);
    var lineas = meta.clases.map(function (c) {
      var p = sv('path', { class: 'linea-' + c });
      gl.appendChild(p);
      return p;
    });
    s.appendChild(gl);

    var puntos = meta.clases.map(function (c) {
      var fila = [];
      for (var j = 0; j < n; j++) {
        var cir = sv('circle', { class: 'punto punto-' + c, r: 3 });
        cir.style.setProperty('--j', String(j));
        s.appendChild(cir);
        fila.push(cir);
      }
      return fila;
    });
    var etiquetas = meta.clases.map(function () {
      var t = sv('text', { class: 'etiqueta-valor' });
      s.appendChild(t);
      return t;
    });
    var guia = sv('line', { class: 'guia', y1: m.t, y2: h - m.b });
    s.appendChild(guia);
    var anillos = meta.clases.map(function (c) {
      var a = sv('circle', { class: 'anillo anillo-' + c, r: 5.5 });
      s.appendChild(a);
      return a;
    });

    var cur = null;
    var hov = -1;
    var vivo = meta;

    function X(i2) { return x0 + i2 * paso; }
    function Y(v) { return m.t + (h - m.t - m.b) * (1 - v / cur.techo); }

    function posicionTip(medir) {
      var filas = tip.querySelectorAll('.tip-f');
      tip.firstChild.textContent = vivo.titulos[hov];
      var ymin = h;
      vivo.nombres.forEach(function (nom, k) {
        var v = cur.v[k][hov];
        filas[k].firstChild.textContent = nom;
        filas[k].lastChild.textContent = pct(v);
        var yy = Y(v);
        if (yy < ymin) { ymin = yy; }
        anillos[k].setAttribute('cx', X(hov));
        anillos[k].setAttribute('cy', yy);
      });
      guia.setAttribute('x1', X(hov));
      guia.setAttribute('x2', X(hov));
      if (medir) {
        var tw = tip.offsetWidth;
        var th = tip.offsetHeight;
        var px = Math.max(0, Math.min(w - tw, X(hov) - tw / 2));
        var py = ymin - th - 16;
        if (py < 0) { py = Math.min(h - th, ymin + 16); }
        tip.style.transform = 'translate(' + px.toFixed(1) + 'px, ' + py.toFixed(1) + 'px)';
      }
    }

    function mostrar(i2) {
      var k = Math.max(0, Math.min(n - 1, i2));
      if (k === hov) { return; }
      hov = k;
      guia.classList.add('on');
      anillos.forEach(function (a) { a.classList.add('on'); });
      tip.classList.add('on');
      posicionTip(true);
    }
    function ocultar() {
      hov = -1;
      guia.classList.remove('on');
      anillos.forEach(function (a) { a.classList.remove('on'); });
      tip.classList.remove('on');
    }

    s.addEventListener('pointermove', function (ev) {
      var r = s.getBoundingClientRect();
      if (!r.width) { return; }
      mostrar(Math.round(((ev.clientX - r.left) * w / r.width - x0) / paso));
    });
    s.addEventListener('pointerleave', ocultar);

    return {
      svg: s, w: w, mostrar: mostrar, ocultar: ocultar, n: n,
      indice: function () { return hov; },
      meta: function (nuevo) {
        vivo = nuevo;
        s.setAttribute('aria-label', nuevo.desc);
        titulo.textContent = nuevo.desc;
      },
      interp: function (a, b, t) {
        var e = suavizar(t);
        return { v: mezclar(a.v, b.v, e), techo: lerp(a.techo, b.techo, e), s: lerp(a.s, b.s, e) };
      },
      render: function (st) {
        cur = st;
        var k;
        for (k = 0; k <= 5; k++) {
          var yy = Y(st.techo * k / 5);
          rejilla[k].setAttribute('y1', yy.toFixed(1));
          rejilla[k].setAttribute('y2', yy.toFixed(1));
          ejeY[k].setAttribute('y', (yy + 4).toFixed(1));
          ejeY[k].textContent = pct(st.techo * k / 5, 0);
        }
        banda.setAttribute('x', (X(st.s) - paso / 2).toFixed(1));
        st.v.forEach(function (serie, q) {
          var pts = serie.map(function (v, j) { return X(j).toFixed(1) + ' ' + Y(v).toFixed(1); });
          var d = 'M' + pts.join(' L');
          lineas[q].setAttribute('d', d);
          if (q === 0) {
            area.setAttribute('d', d + ' L' + X(n - 1).toFixed(1) + ' ' + Y(0).toFixed(1) + ' L' + X(0).toFixed(1) + ' ' + Y(0).toFixed(1) + ' Z');
          }
          serie.forEach(function (v, j) {
            var c = puntos[q][j];
            c.setAttribute('cx', X(j).toFixed(1));
            c.setAttribute('cy', Y(v).toFixed(1));
            c.setAttribute('r', (3 + 2 * Math.max(0, 1 - Math.abs(j - st.s))).toFixed(2));
          });
        });
        var i0 = Math.max(0, Math.min(n - 1, Math.floor(st.s)));
        var i1 = Math.min(n - 1, i0 + 1);
        var f = st.s - i0;
        var ultimo = st.s > n - 1.5;
        var lista = st.v.map(function (serie, q) {
          var v = lerp(serie[i0], serie[i1], f);
          return { q: q, y: ultimo ? Y(v) + 4 : Y(v) - 9, texto: pct(v) };
        }).sort(function (a, b) { return a.y - b.y; });
        for (k = 1; k < lista.length; k++) {
          if (lista[k].y - lista[k - 1].y < 14) { lista[k].y = lista[k - 1].y + 14; }
        }
        lista.forEach(function (e) {
          var t = etiquetas[e.q];
          t.setAttribute('x', (X(st.s) + (ultimo ? 10 : 0)).toFixed(1));
          t.setAttribute('y', e.y.toFixed(1));
          t.setAttribute('text-anchor', ultimo ? 'start' : 'middle');
          t.textContent = e.texto;
        });
        if (hov >= 0) { posicionTip(false); }
      }
    };
  }

  // Barras horizontales agrupadas: estado { v: [categoría][serie], techo }.
  function fabricaBarras(cont, w, meta) {
    var alto = 14;
    var sep = 4;
    var cabecera = 20;
    var hueco = 14;
    var nS = meta.clases.length;
    var nC = meta.cats.length;
    var grupo = cabecera + nS * alto + (nS - 1) * sep + hueco;
    var h = nC * grupo + 4;
    var largo = w - 56;
    var s = sv('svg', { viewBox: '0 0 ' + w + ' ' + h, role: 'img', 'aria-label': meta.desc, class: 'barras' });
    var titulo = sv('title', null, meta.desc);
    s.appendChild(titulo);
    var rects = [];
    var vals = [];
    var rotulos = [];
    meta.cats.forEach(function (c, i) {
      var y = i * grupo;
      var gr = sv('g', { class: 'grupo' });
      var rot = sv('text', { class: 'suave', x: 0, y: y + 13 }, c);
      gr.appendChild(rot);
      rotulos.push(rot);
      rects.push([]);
      vals.push([]);
      meta.clases.forEach(function (cl, k) {
        var by = y + cabecera + k * (alto + sep);
        var r = sv('rect', { class: 'barra-' + cl, x: 0, y: by, width: 0, height: alto, rx: 2 });
        var t = sv('text', { class: 'etiqueta-valor', x: 6, y: by + 12 });
        gr.appendChild(r);
        gr.appendChild(t);
        rects[i].push(r);
        vals[i].push(t);
      });
      s.appendChild(gr);
    });
    return {
      svg: s, w: w,
      meta: function (nuevo) {
        s.setAttribute('aria-label', nuevo.desc);
        titulo.textContent = nuevo.desc;
        nuevo.cats.forEach(function (c, i) { rotulos[i].textContent = c; });
      },
      interp: function (a, b, t) {
        var tot = 1 + 0.07 * (a.v.length - 1);
        return {
          techo: lerp(a.techo, b.techo, suavizar(t)),
          v: a.v.map(function (fila, i) {
            var tt = suavizar(acotar(t * tot - 0.07 * i));
            return fila.map(function (x, k) { return lerp(x, b.v[i][k], tt); });
          })
        };
      },
      render: function (st) {
        st.v.forEach(function (fila, i) {
          fila.forEach(function (v, k) {
            var ancho = Math.max(v > 0.005 ? 2 : 0, largo * v / st.techo);
            rects[i][k].setAttribute('width', ancho.toFixed(1));
            vals[i][k].setAttribute('x', (ancho + 6).toFixed(1));
            vals[i][k].textContent = pct(v);
          });
        });
      }
    };
  }

  function cerosBarras(d) {
    return { techo: d.techo, v: d.v.map(function (f) { return f.map(function () { return 0; }); }) };
  }

  var G = {};

  // ---------- Secciones ----------

  var K = {};
  var matriz = null;
  var alertasUI = null;
  var pildoras = [];

  function celda(mes, seg) { return D.meses[mes][seg]; }

  function crearKpis() {
    K.m2 = contador($('k-m2'), function (v) { return pct(v); });
    K.cli = contador($('k-cli'), entero);
    K.exp = contador($('k-exp'), millones);
    K.e2 = contador($('k-e2'), function (v) { return pct(v); });
    K.top = contador($('k-top'), function (v) { return pct(v); });
    K.inc = contador($('k-inc'), function (v) { return pct(v); });
  }

  function pintarKpis() {
    var c = celda(filtro.mes, filtro.seg);
    var ant = mesAnterior(filtro.mes);
    var cAnt = ant ? celda(ant, filtro.seg) : null;
    function delta(actual, previo) {
      if (previo === null) { return 'Sin mes anterior en la base'; }
      var d = actual - previo;
      return (d >= 0 ? '+' : '−') + Math.abs(d).toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) +
        ' puntos frente a ' + MESES_LARGO[ant];
    }
    var m2 = parte(c.mora_2mas_clientes, c.clientes);
    var e2 = parte(c.mora_2mas_exposicion, c.exposicion);
    var t10 = parte(c.top10_exposicion, c.exposicion);
    K.m2.poner(m2);
    texto('k-m2-c', delta(m2, cAnt ? parte(cAnt.mora_2mas_clientes, cAnt.clientes) : null));
    K.cli.poner(c.clientes);
    texto('k-cli-c', nombreSeg(filtro.seg));
    K.exp.poner(c.exposicion);
    texto('k-exp-c', 'Saldo promedio ' + nf.format(Math.round(c.exposicion / c.clientes)) + ' por cliente');
    K.e2.poner(e2);
    texto('k-e2-c', delta(e2, cAnt ? parte(cAnt.mora_2mas_exposicion, cAnt.exposicion) : null));
    K.top.poner(t10);
    texto('k-top-c', delta(t10, cAnt ? parte(cAnt.top10_exposicion, cAnt.exposicion) : null));
    if (c.incumplen_siguiente_mes !== undefined) {
      K.inc.poner(parte(c.incumplen_siguiente_mes, c.clientes));
      texto('k-inc-c', 'Octubre de 2005, observado en la base');
    } else {
      K.inc.poner(null, 'n. d.');
      texto('k-inc-c', 'La base solo lo trae para septiembre');
    }
  }

  function pintarMora() {
    var meses = D.meta.meses;
    var cats = meses.map(function (m) { return MESES_LARGO[m].slice(0, 3); });
    var series = [
      { clase: 'a', linea: true, nombre: '1 mes o más', campo: 'mora_1mas_clientes' },
      { clase: 'b', linea: true, nombre: '2 meses o más', campo: 'mora_2mas_clientes' },
      { clase: 'c', linea: true, nombre: '3 meses o más', campo: 'mora_3mas_clientes' }
    ].map(function (s) {
      s.valores = meses.map(function (m) { var c = celda(m, filtro.seg); return parte(c[s.campo], c.clientes); });
      return s;
    });
    texto('d-mora', 'Porcentaje de clientes con atraso en cada mes. ' + nombreSeg(filtro.seg) + '.');
    if (!$('l-mora').firstChild) { leyenda($('l-mora'), series); }
    var desc = 'Mora por mes de abril a septiembre. ' + series.map(function (s) {
      return s.nombre + ': ' + s.valores.map(function (v, i) { return cats[i] + ' ' + pct(v); }).join(', ');
    }).join('. ');
    var max = 0;
    series.forEach(function (s) { s.valores.forEach(function (v) { if (v > max) { max = v; } }); });
    G.mora.poner(
      { v: series.map(function (s) { return s.valores; }), techo: techoLimpio(max * 1.08), s: meses.indexOf(filtro.mes) },
      {
        cats: cats, clases: ['a', 'b', 'c'], nombres: series.map(function (s) { return s.nombre; }), desc: desc,
        titulos: meses.map(function (m) { return mayus(MESES_LARGO[m]) + ' de 2005'; })
      }
    );
    $('n-mora').textContent = D.meta.nota_mora;
    var cuerpo = $('t-datos-mora');
    vaciar(cuerpo);
    cuerpo.appendChild(tabla('Porcentaje de clientes con atraso', ['Mes'].concat(series.map(function (s) { return s.nombre; })),
      meses.map(function (m, i) { return [MESES_LARGO[m]].concat(series.map(function (s) { return pct(s.valores[i]); })); }),
      [1, 2, 3]));
  }

  function claseCalor(p) {
    if (p < 1) { return 'calor-0'; }
    if (p < 10) { return 'calor-1'; }
    if (p < 25) { return 'calor-2'; }
    if (p < 50) { return 'calor-3'; }
    return 'calor-4';
  }

  function crearMatriz() {
    var cont = $('m-roll');
    var nG = D.grupos_mora.length;
    var t = el('table', 'matriz');
    var cap = el('caption');
    t.appendChild(cap);
    var cab = el('thead');
    var fc = el('tr');
    var th0 = el('th', null, 'Antes / ahora');
    th0.setAttribute('scope', 'col');
    fc.appendChild(th0);
    D.grupos_mora.forEach(function (g) { var th = el('th', null, g); th.setAttribute('scope', 'col'); fc.appendChild(th); });
    cab.appendChild(fc);
    t.appendChild(cab);
    var cuerpo = el('tbody');
    var filas = [];
    for (var i = 0; i < nG; i++) {
      var tr = el('tr');
      var th = el('th');
      th.setAttribute('scope', 'row');
      tr.appendChild(th);
      var celdas = [];
      for (var j = 0; j < nG; j++) {
        var td = el('td', 'calor-0');
        td.style.setProperty('--k', String(i * nG + j));
        var pn = el('span', 'pct');
        var nn = el('span', 'n');
        td.appendChild(pn);
        td.appendChild(nn);
        tr.appendChild(td);
        celdas.push({ td: td, n: nn, pct: contador(pn, function (v) { return pct(v); }), clase: 'calor-0' });
      }
      cuerpo.appendChild(tr);
      filas.push({ th: th, celdas: celdas });
    }
    t.appendChild(cuerpo);
    var vacio = el('p', 'vacio', 'Abril es el primer mes de la base y no tiene mes anterior. Elige de mayo a septiembre.');
    vacio.hidden = true;
    cont.appendChild(t);
    cont.appendChild(vacio);
    matriz = { tabla: t, cap: cap, filas: filas, vacio: vacio, visto: false };
    alVer(cont, function () {
      matriz.visto = true;
      aplicarCalor();
      matriz.filas.forEach(function (f) { f.celdas.forEach(function (c) { c.pct.ver(); }); });
    });
  }

  function aplicarCalor() {
    if (!matriz || !matriz.visto) { return; }
    matriz.filas.forEach(function (f) {
      f.celdas.forEach(function (c) { if (c.td.className !== c.clase) { c.td.className = c.clase; } });
    });
  }

  function pintarRoll() {
    var ant = mesAnterior(filtro.mes);
    var roll = D.transiciones[filtro.mes][filtro.seg];
    if (!roll) {
      texto('d-roll', 'Se comparan dos meses seguidos.');
      matriz.tabla.hidden = true;
      matriz.vacio.hidden = false;
      return;
    }
    matriz.tabla.hidden = false;
    matriz.vacio.hidden = true;
    texto('d-roll', 'Cómo pasaron los clientes de ' + MESES_LARGO[ant] + ' a ' + MESES_LARGO[filtro.mes] +
      '. Cada fila suma 100%. ' + nombreSeg(filtro.seg) + '.');
    matriz.cap.textContent = 'Estado en ' + MESES_LARGO[ant] + ' (filas) y estado en ' + MESES_LARGO[filtro.mes] + ' (columnas)';
    roll.forEach(function (fila, i) {
      var total = fila.reduce(function (a, b) { return a + b; }, 0);
      matriz.filas[i].th.textContent = D.grupos_mora[i] + ' (' + nf.format(total) + ')';
      fila.forEach(function (n, j) {
        var p = parte(n, total);
        var c = matriz.filas[i].celdas[j];
        c.clase = claseCalor(p);
        c.n.textContent = nf.format(n) + ' clientes';
        if (total) { c.pct.poner(p); } else { c.pct.poner(null, 'n. d.'); }
      });
    });
    aplicarCalor();
  }

  function datosBarras(cats, pc, pe) {
    var max = 0;
    pc.concat(pe).forEach(function (v) { if (v > max) { max = v; } });
    return { v: cats.map(function (c, i) { return [pc[i], pe[i]]; }), techo: techoLimpio(max * 1.02) };
  }

  function pintarVencimiento() {
    var c = celda(filtro.mes, filtro.seg);
    var est = c.estados.slice(0, 5);
    var t3 = c.estados.slice(5).reduce(function (a, e) {
      return { clientes: a.clientes + e.clientes, exposicion: a.exposicion + e.exposicion, incumplen_siguiente_mes: (a.incumplen_siguiente_mes || 0) + (e.incumplen_siguiente_mes || 0) };
    }, { clientes: 0, exposicion: 0 });
    est.push(t3);
    var cats = D.estados.slice(0, 5).concat(['3 meses o más']);
    var pc = est.map(function (e) { return parte(e.clientes, c.clientes); });
    var pe = est.map(function (e) { return parte(e.exposicion, c.exposicion); });
    var series = [{ clase: 'a', nombre: '% de clientes' }, { clase: 'e', nombre: '% de la exposición' }];
    texto('d-venc', 'Estado de pago de ' + MESES_LARGO[filtro.mes] + '. ' + nombreSeg(filtro.seg) + '.');
    if (!$('l-venc').firstChild) { leyenda($('l-venc'), series); }
    var desc = 'Estado de pago en ' + MESES_LARGO[filtro.mes] + ': ' + cats.map(function (n, i) {
      return n + ', ' + pct(pc[i]) + ' de clientes y ' + pct(pe[i]) + ' de la exposición';
    }).join('; ');
    G.venc.poner(datosBarras(cats, pc, pe), { cats: cats, clases: ['a', 'e'], desc: desc });
    var conInc = c.incumplen_siguiente_mes !== undefined;
    var cab = ['Estado de pago', 'Clientes', '% de clientes', 'Exposición (millones)', '% de la exposición'];
    if (conInc) { cab.push('Incumplen el mes siguiente'); }
    var filas = est.map(function (e, i) {
      var f = [cats[i], nf.format(e.clientes), pct(pc[i]), (e.exposicion / 1e6).toLocaleString('es-MX', { maximumFractionDigits: 0 }), pct(pe[i])];
      if (conInc) { f.push(e.clientes ? pct(parte(e.incumplen_siguiente_mes, e.clientes)) : 'n. d.'); }
      return f;
    });
    var cuerpo = $('t-datos-venc');
    vaciar(cuerpo);
    cuerpo.appendChild(tabla('Vencimiento por estado de pago', cab, filas, conInc ? [1, 2, 3, 4, 5] : [1, 2, 3, 4]));
  }

  function pintarUso() {
    var c = celda(filtro.mes, filtro.seg);
    var cats = D.bandas_uso;
    var pc = c.uso.map(function (e) { return parte(e.clientes, c.clientes); });
    var pe = c.uso.map(function (e) { return parte(e.exposicion, c.exposicion); });
    var series = [{ clase: 'a', nombre: '% de clientes' }, { clase: 'e', nombre: '% de la exposición' }];
    texto('d-uso', 'Saldo de ' + MESES_LARGO[filtro.mes] + ' entre el límite de la línea. ' + nombreSeg(filtro.seg) + '.');
    if (!$('l-uso').firstChild) { leyenda($('l-uso'), series); }
    var desc = 'Concentración por banda de uso en ' + MESES_LARGO[filtro.mes] + ': ' + cats.map(function (n, i) {
      return n + ', ' + pct(pc[i]) + ' de clientes y ' + pct(pe[i]) + ' de la exposición';
    }).join('; ');
    G.uso.poner(datosBarras(cats, pc, pe), { cats: cats, clases: ['a', 'e'], desc: desc });
    var cuerpo = $('t-datos-uso');
    vaciar(cuerpo);
    cuerpo.appendChild(tabla('Concentración por banda de uso', ['Banda de uso', 'Clientes', '% de clientes', 'Exposición (millones)', '% de la exposición'],
      c.uso.map(function (e, i) {
        return [cats[i], nf.format(e.clientes), pct(pc[i]), (e.exposicion / 1e6).toLocaleString('es-MX', { maximumFractionDigits: 0 }), pct(pe[i])];
      }), [1, 2, 3, 4]));
  }

  function pintarSegmentos() {
    var total = celda(filtro.mes, 'todos');
    var segs = D.segmentos.filter(function (s) { return s.id !== 'todos'; });
    var cats = segs.map(function (s) { return s.nombre + (s.id === filtro.seg ? ' (seleccionado)' : ''); });
    var pc = segs.map(function (s) { return parte(celda(filtro.mes, s.id).clientes, total.clientes); });
    var pe = segs.map(function (s) { return parte(celda(filtro.mes, s.id).exposicion, total.exposicion); });
    var series = [{ clase: 'a', nombre: '% de clientes' }, { clase: 'e', nombre: '% de la exposición' }];
    texto('d-seg', 'Reparto de la cartera completa en ' + MESES_LARGO[filtro.mes] + ' por tamaño de línea. Esta gráfica no cambia con el filtro de segmento.');
    if (!$('l-seg').firstChild) { leyenda($('l-seg'), series); }
    var desc = 'Concentración por segmento en ' + MESES_LARGO[filtro.mes] + ': ' + segs.map(function (s, i) {
      return s.nombre + ', ' + pct(pc[i]) + ' de clientes y ' + pct(pe[i]) + ' de la exposición';
    }).join('; ');
    G.seg.poner(datosBarras(cats, pc, pe), { cats: cats, clases: ['a', 'e'], desc: desc });
    var cuerpo = $('t-datos-seg');
    vaciar(cuerpo);
    cuerpo.appendChild(tabla('Concentración por segmento', ['Segmento', 'Clientes', '% de clientes', 'Exposición (millones)', '% de la exposición'],
      segs.map(function (s, i) {
        var c = celda(filtro.mes, s.id);
        return [s.nombre, nf.format(c.clientes), pct(pc[i]), (c.exposicion / 1e6).toLocaleString('es-MX', { maximumFractionDigits: 0 }), pct(pe[i])];
      }), [1, 2, 3, 4]));
  }

  function pintarUmbrales() {
    var cont = $('t-umbrales');
    vaciar(cont);
    var claves = Object.keys(D.umbrales);
    cont.appendChild(tabla('Umbrales vigentes', ['Indicador', 'Ámbar desde', 'Rojo desde'],
      claves.map(function (k) { var u = D.umbrales[k]; return [u.nombre, pct(u.ambar, 0), pct(u.rojo, 0)]; }), [1, 2]));
  }

  // ---------- Alertas ----------

  function crearAlertas() {
    var res = $('resumen-alertas');
    var cuentas = {};
    ['rojo', 'ambar', 'verde'].forEach(function (e) {
      var s = el('span', 'semaforo ' + e);
      var dentro = el('span');
      s.appendChild(dentro);
      res.appendChild(s);
      cuentas[e] = contador(dentro, function (v) { return Math.round(v) + ' en ' + ETIQUETA[e].toLowerCase(); });
    });

    var cont = $('t-alertas-tabla');
    var t = el('table', 'tabla-alertas');
    var cap = el('caption');
    t.appendChild(cap);
    var cab = el('thead');
    var fc = el('tr');
    var ths = [];
    [['Semáforo', ''], ['Indicador', ''], ['Segmento', ''], ['Valor', 'num'], ['Ámbar desde', 'num'], ['Rojo desde', 'num']].forEach(function (c, i) {
      var th = el('th', c[1]);
      th.setAttribute('scope', 'col');
      var b = el('button', 'orden');
      b.type = 'button';
      b.appendChild(el('span', null, c[0]));
      var fl = el('span', 'flecha');
      fl.setAttribute('aria-hidden', 'true');
      b.appendChild(fl);
      b.setAttribute('aria-label', 'Ordenar por ' + c[0].toLowerCase());
      b.addEventListener('click', function () {
        if (orden.col !== i) { orden.col = i; orden.dir = 1; }
        else if (orden.dir === 1) { orden.dir = -1; }
        else { orden.col = -1; orden.dir = 1; }
        pintarAlertas();
      });
      th.appendChild(b);
      fc.appendChild(th);
      ths.push(th);
    });
    cab.appendChild(fc);
    t.appendChild(cab);
    var cuerpo = el('tbody');
    t.appendChild(cuerpo);
    var vacio = el('p', 'vacio', 'Ninguna alerta coincide con los filtros elegidos.');
    vacio.hidden = true;
    cont.appendChild(t);
    cont.appendChild(vacio);
    alertasUI = { cuentas: cuentas, tabla: t, cap: cap, cuerpo: cuerpo, vacio: vacio, ths: ths };
  }

  function claveOrden(a, col) {
    var u = D.umbrales[a.indicador];
    switch (col) {
      case 0: return ORDEN[a.estado];
      case 1: return u.nombre;
      case 2: return nombreSeg(a.segmento);
      case 3: return a.valor;
      case 4: return u.ambar;
      default: return u.rojo;
    }
  }

  function pintarAlertas() {
    var alcance = D.alertas.filter(function (a) {
      return a.mes === filtro.mes && (filtro.todosSeg || a.segmento === filtro.seg);
    });
    var cuenta = { rojo: 0, ambar: 0, verde: 0 };
    alcance.forEach(function (a) { cuenta[a.estado] += 1; });
    ['rojo', 'ambar', 'verde'].forEach(function (e) { alertasUI.cuentas[e].poner(cuenta[e]); });
    texto('d-alertas', 'Indicadores de ' + MESES_LARGO[filtro.mes] + ' contra los umbrales. ' +
      (filtro.todosSeg ? 'Todos los segmentos.' : nombreSeg(filtro.seg) + '.') +
      (filtro.mes === 'abr' ? ' Los indicadores de roll rate no aplican en abril.' : ''));
    var lista = alcance.filter(function (a) { return filtro.estado === 'todos' || a.estado === filtro.estado; });
    function porDefecto(a, b) {
      if (ORDEN[a.estado] !== ORDEN[b.estado]) { return ORDEN[a.estado] - ORDEN[b.estado]; }
      return b.valor / D.umbrales[b.indicador].rojo - a.valor / D.umbrales[a.indicador].rojo;
    }
    lista.sort(function (a, b) {
      if (orden.col < 0) { return porDefecto(a, b); }
      var ka = claveOrden(a, orden.col);
      var kb = claveOrden(b, orden.col);
      var r = typeof ka === 'string' ? ka.localeCompare(kb, 'es') : ka - kb;
      return r ? r * orden.dir : porDefecto(a, b);
    });
    alertasUI.ths.forEach(function (th, i) {
      th.setAttribute('aria-sort', orden.col === i ? (orden.dir === 1 ? 'ascending' : 'descending') : 'none');
    });
    vaciar(alertasUI.cuerpo);
    if (!lista.length) {
      alertasUI.tabla.hidden = true;
      alertasUI.vacio.hidden = false;
      return;
    }
    alertasUI.tabla.hidden = false;
    alertasUI.vacio.hidden = true;
    alertasUI.cap.textContent = lista.length + ' alertas';
    lista.forEach(function (a, k) {
      var u = D.umbrales[a.indicador];
      var tr = el('tr', 'fila');
      tr.style.setProperty('--k', String(Math.min(k, 12)));
      var td = el('td');
      td.appendChild(semaforo(a.estado));
      tr.appendChild(td);
      tr.appendChild(el('td', null, u.nombre));
      tr.appendChild(el('td', null, nombreSeg(a.segmento)));
      tr.appendChild(el('td', 'num', pct(a.valor, 2)));
      tr.appendChild(el('td', 'num', pct(u.ambar, 0)));
      tr.appendChild(el('td', 'num', pct(u.rojo, 0)));
      alertasUI.cuerpo.appendChild(tr);
    });
  }

  function anunciar() {
    $('anuncio').textContent = 'Datos de ' + MESES_LARGO[filtro.mes] + ' de 2005. ' + nombreSeg(filtro.seg) + '.';
  }

  function pintarTodo() {
    pintarKpis();
    pintarMora();
    pintarRoll();
    pintarVencimiento();
    pintarUso();
    pintarSegmentos();
    pintarAlertas();
  }

  // ---------- Controles segmentados con píldora deslizante ----------

  function segmentado(cont, opciones, inicial, alCambiar) {
    var pild = el('span', 'pildora');
    pild.setAttribute('aria-hidden', 'true');
    cont.appendChild(pild);
    var botones = [];
    function ubicar(sinAnimar) {
      var act = null;
      botones.forEach(function (b) { if (b.getAttribute('aria-pressed') === 'true') { act = b; } });
      if (!act || !act.offsetWidth) { return; }
      if (sinAnimar) { pild.style.transition = 'none'; }
      pild.style.width = act.offsetWidth + 'px';
      pild.style.transform = 'translateX(' + act.offsetLeft + 'px)';
      pild.classList.add('lista');
      if (sinAnimar) { void pild.offsetWidth; pild.style.transition = ''; }
    }
    opciones.forEach(function (o) {
      var b = el('button', null, o.texto);
      b.type = 'button';
      b.setAttribute('aria-pressed', o.valor === inicial ? 'true' : 'false');
      if (o.largo) { b.setAttribute('aria-label', o.largo); }
      b.addEventListener('click', function () {
        botones.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        ubicar(false);
        alCambiar(o.valor);
      });
      botones.push(b);
      cont.appendChild(b);
    });
    ubicar(true);
    pildoras.push(ubicar);
  }

  // ---------- Barra fija y navegación ----------

  function iniciarBarra() {
    var barra = $('barra');
    var centinela = $('centinela');
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        var e = es[es.length - 1];
        var fija = !e.isIntersecting && e.boundingClientRect.top < 0;
        barra.classList.toggle('fija', fija);
        if (!fija && nav.links.length) { marcarNav('resumen'); }
      }).observe(centinela);
    } else {
      window.addEventListener('scroll', function () {
        barra.classList.toggle('fija', centinela.getBoundingClientRect().top < 0);
      }, { passive: true });
    }
  }

  var nav = { links: [], ind: null, activo: 'resumen' };

  function marcarNav(id) {
    nav.activo = id;
    var act = null;
    nav.links.forEach(function (a) {
      var es = a.getAttribute('href') === '#' + id;
      if (es) { act = a; a.setAttribute('aria-current', 'true'); } else { a.removeAttribute('aria-current'); }
    });
    if (act && act.offsetWidth) {
      nav.ind.style.transform = 'translateX(' + act.offsetLeft + 'px) scaleX(' + (act.offsetWidth / 100).toFixed(3) + ')';
      nav.ind.classList.add('lista');
    }
  }

  function iniciarNav() {
    nav.links = Array.prototype.slice.call($('nav').querySelectorAll('a'));
    nav.ind = $('nav-ind');
    var ids = nav.links.map(function (a) { return a.getAttribute('href').slice(1); });
    nav.links.forEach(function (a) {
      a.addEventListener('click', function () { marcarNav(a.getAttribute('href').slice(1)); });
    });
    marcarNav('resumen');
    if ('IntersectionObserver' in window) {
      var o = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { marcarNav(e.target.id); } });
      }, { rootMargin: '-35% 0px -55% 0px', threshold: 0 });
      ids.forEach(function (id) { var s = $(id); if (s) { o.observe(s); } });
    }
  }

  // ---------- Aparición escalonada ----------

  function iniciarRevelado() {
    var nodos = document.querySelectorAll('.rev, [data-ver]');
    Array.prototype.forEach.call(nodos, function (n) {
      if (n.classList.contains('rev')) {
        var i = 0;
        var h = n.previousElementSibling;
        while (h) { if (h.classList.contains('rev')) { i += 1; } h = h.previousElementSibling; }
        n.style.setProperty('--d', Math.min(i * 70, 280) + 'ms');
      }
      alVer(n, function () { n.classList.add('vis'); });
    });
  }

  // ---------- Arranque ----------

  function llenarFiltros() {
    segmentado($('f-mes'), D.meta.meses.map(function (m) {
      var l = MESES_LARGO[m];
      return { valor: m, texto: mayus(l).slice(0, 3), largo: mayus(l) + ' de 2005' };
    }), filtro.mes, function (v) { filtro.mes = v; pintarTodo(); anunciar(); });
    segmentado($('f-estado'), [
      { valor: 'todos', texto: 'Todos' }, { valor: 'rojo', texto: 'Rojo' },
      { valor: 'ambar', texto: 'Ámbar' }, { valor: 'verde', texto: 'Verde' }
    ], filtro.estado, function (v) { filtro.estado = v; pintarAlertas(); });
    var fs = $('f-segmento');
    D.segmentos.forEach(function (s) {
      var o = el('option', null, s.nombre);
      o.value = s.id;
      fs.appendChild(o);
    });
    fs.value = filtro.seg;
    fs.addEventListener('change', function () { filtro.seg = fs.value; pintarTodo(); anunciar(); });
    $('f-todos-seg').addEventListener('change', function (e) { filtro.todosSeg = e.target.checked; pintarAlertas(); });
  }

  function crearGraficas() {
    G.mora = crearGrafica($('g-mora'), fabricaLineas, { min: 280, crecer: false, dur: 850 });
    G.venc = crearGrafica($('g-venc'), fabricaBarras, { min: 240, crecer: true, cero: cerosBarras, dur: 800 });
    G.uso = crearGrafica($('g-uso'), fabricaBarras, { min: 240, crecer: true, cero: cerosBarras, dur: 800 });
    G.seg = crearGrafica($('g-seg'), fabricaBarras, { min: 240, crecer: true, cero: cerosBarras, dur: 800 });
    // Teclado en la gráfica de mora: flechas recorren los meses y muestran el valor.
    var cm = $('g-mora');
    cm.addEventListener('focus', function () {
      if (G.mora.ctx && G.mora.actual) { G.mora.ctx.mostrar(Math.round(G.mora.actual.s)); }
    });
    cm.addEventListener('blur', function () { if (G.mora.ctx) { G.mora.ctx.ocultar(); } });
    cm.addEventListener('keydown', function (e) {
      var c = G.mora.ctx;
      if (!c) { return; }
      var i = c.indice() < 0 ? Math.round(G.mora.actual.s) : c.indice();
      if (e.key === 'ArrowRight') { c.mostrar(i + 1); } else if (e.key === 'ArrowLeft') { c.mostrar(i - 1); }
      else if (e.key === 'Home') { c.mostrar(0); } else if (e.key === 'End') { c.mostrar(c.n - 1); }
      else if (e.key === 'Escape') { c.ocultar(); return; } else { return; }
      e.preventDefault();
    });
  }

  function validar(d) {
    return d && d.meta && Array.isArray(d.meta.meses) && d.meses && d.transiciones && Array.isArray(d.alertas) &&
      Array.isArray(d.segmentos) && d.umbrales;
  }

  function mostrarError(t) {
    var e = $('error');
    e.textContent = t;
    e.hidden = false;
  }

  function iniciarTema() {
    var modos = ['auto', 'claro', 'oscuro'];
    var i = 0;
    var b = $('tema');
    var espera = null;
    b.addEventListener('click', function () {
      i = (i + 1) % modos.length;
      raiz.classList.add('tema-cambia');
      if (modos[i] === 'auto') { raiz.removeAttribute('data-theme'); }
      else { raiz.setAttribute('data-theme', modos[i] === 'claro' ? 'light' : 'dark'); }
      b.textContent = 'Tema: ' + (modos[i] === 'auto' ? 'automático' : modos[i]);
      clearTimeout(espera);
      espera = setTimeout(function () { raiz.classList.remove('tema-cambia'); }, 650);
    });
  }

  function alRedimensionar() {
    graficas.forEach(function (g) { g.redimensionar(); });
    pildoras.forEach(function (u) { u(true); });
    marcarNav(nav.activo);
  }

  function iniciar() {
    iniciarTema();
    iniciarBarra();
    iniciarNav();
    iniciarRevelado();
    fetch('datos/cartera.json', { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) { throw new Error('HTTP ' + r.status); }
        return r.json();
      })
      .then(function (d) {
        if (!validar(d)) { throw new Error('formato'); }
        D = d;
        $('pie').textContent = D.meta.aviso + ' ' + D.meta.nota_incumplimiento;
        llenarFiltros();
        crearKpis();
        crearMatriz();
        crearAlertas();
        crearGraficas();
        pintarUmbrales();
        pintarTodo();
        marcarNav(nav.activo);
        var espera = null;
        function diferir() { clearTimeout(espera); espera = setTimeout(alRedimensionar, 120); }
        window.addEventListener('resize', diferir);
        if ('ResizeObserver' in window) {
          var ro = new ResizeObserver(diferir);
          graficas.forEach(function (g) { ro.observe(g.cont); });
        }
        if (document.fonts && document.fonts.ready) { document.fonts.ready.then(alRedimensionar); }
      })
      .catch(function () {
        mostrarError('No se pudo leer datos/cartera.json. Abre la página desde un servidor local, por ejemplo con "python -m http.server" dentro de la carpeta web, y revisa que el archivo exista.');
      });
  }

  iniciar();
})();
