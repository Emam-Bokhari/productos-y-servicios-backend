import * as fs from "fs";
import * as path from "path";
import puppeteer, { Page } from "puppeteer";
import sharp from "sharp";
import axios from "axios";

function getDrawioFiles(dir: string): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getDrawioFiles(filePath));
    } else if (filePath.endsWith(".drawio")) {
      results.push(filePath);
    }
  }
  return results;
}

function ensureSvgNamespaces(svgStr: string): string {
  return svgStr.replace(/<svg\b([^>]*)>/i, (match, attrs) => {
    let updatedAttrs = attrs;
    if (!/xmlns\s*=/i.test(updatedAttrs)) {
      updatedAttrs += ' xmlns="http://www.w3.org/2000/svg"';
    }
    if (!/xmlns:xlink\s*=/i.test(updatedAttrs)) {
      updatedAttrs += ' xmlns:xlink="http://www.w3.org/1999/xlink"';
    }
    return `<svg${updatedAttrs}>`;
  });
}

function resolveLightDark(svgStr: string, isDark: boolean): string {
  let result = "";
  let i = 0;
  const target = "light-dark(";

  while (i < svgStr.length) {
    const idx = svgStr.indexOf(target, i);
    if (idx === -1) {
      result += svgStr.slice(i);
      break;
    }

    result += svgStr.slice(i, idx);
    const start = idx + target.length;
    let depth = 1;
    let commaPos = -1;
    let j = start;

    while (j < svgStr.length && depth > 0) {
      const char = svgStr[j];
      if (char === "(") {
        depth++;
      } else if (char === ")") {
        depth--;
      } else if (char === "," && depth === 1) {
        commaPos = j;
      }
      j++;
    }

    if (depth === 0 && commaPos !== -1) {
      const arg1 = svgStr.slice(start, commaPos).trim();
      const arg2 = svgStr.slice(commaPos + 1, j - 1).trim();
      const chosen = isDark ? arg2 : arg1;
      result += chosen;
      i = j;
    } else {
      result += target;
      i = start;
    }
  }

  return result;
}

function applyFontFallbacks(svgStr: string): string {
  const fontStack = "Helvetica, Arial, 'Liberation Sans', sans-serif";
  let res = svgStr.replace(
    /font-family:\s*['"]?Helvetica['"]?\s*;/gi,
    `font-family: ${fontStack};`,
  );
  res = res.replace(
    /font-family:\s*['"]?Arial['"]?\s*;/gi,
    `font-family: ${fontStack};`,
  );
  return res;
}

async function renderDrawio(page: Page, drawioPath: string) {
  const dir = path.dirname(drawioPath);
  const baseName = path.basename(drawioPath, ".drawio");
  const svgPath = path.join(dir, `${baseName}.svg`);
  const pngPath = path.join(dir, `${baseName}.png`);
  const pdfPath = path.join(dir, `${baseName}.pdf`);

  console.log(`\nRendering: ${drawioPath}`);

  // Read XML content
  const xmlContent = fs.readFileSync(drawioPath, "utf8");

  // Create Draw.io Viewer JSON config with visibility checks disabled
  const config = {
    highlight: "#3B52DF",
    nav: true,
    resize: true,
    lightbox: false,
    "check-visible-state": false,
    xml: xmlContent,
  };

  const configJson = JSON.stringify(config);
  const encodedConfigJson = encodeURIComponent(configJson);

  // Load local Draw.io static viewer JS content to support offline rendering (auto-download if missing)
  const viewerScriptPath = path.resolve(__dirname, "viewer-static.min.js");
  if (!fs.existsSync(viewerScriptPath)) {
    console.log(
      "viewer-static.min.js not found locally. Downloading from https://viewer.diagrams.net/js/viewer-static.min.js...",
    );
    try {
      const response = await axios.get(
        "https://viewer.diagrams.net/js/viewer-static.min.js",
        { responseType: "text" },
      );
      fs.writeFileSync(viewerScriptPath, response.data, "utf8");
      console.log("Successfully downloaded viewer-static.min.js.");
    } catch (err: any) {
      throw new Error(
        `viewer-static.min.js not found at ${viewerScriptPath} and download failed (${err.message}). Please verify network or place viewer-static.min.js in scripts/ manually.`,
      );
    }
  }
  const viewerScriptContent = fs.readFileSync(viewerScriptPath, "utf8");

  // Local HTML container with offline Draw.io static viewer script inlined
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Draw.io Exporter</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: ${process.env.ERD_THEME === "dark" ? "#0F172A" : "#FFFFFF"};
      overflow: hidden;
      display: inline-block;
    }
    .mxgraph {
      display: inline-block;
      border: none;
    }
  </style>
  <script>
    // Define a dummy MathJax object to bypass dynamic CDN script loading
    window.MathJax = {
      startup: {
        pageReady: function() {}
      }
    };
    try {
      ${viewerScriptContent}
      if (window.Editor) {
        window.Editor.containsMath = function() { return false; };
      }
    } catch(e) {
      console.error("Error inside static viewer load:", e.message || e);
    }
  </script>
</head>
<body>
  <div class="mxgraph"></div>
  <script>
    try {
      // Capture Graph and GraphViewer instances
      window.capturedGraphs = [];
      const originalGraph = window.Graph;
      if (originalGraph) {
        window.Graph = function() {
          const inst = new originalGraph(...arguments);
          window.capturedGraphs.push(inst);
          return inst;
        };
        window.Graph.prototype = originalGraph.prototype;
        Object.assign(window.Graph, originalGraph);
      }

      window.capturedViewers = [];
      const originalGV = window.GraphViewer;
      if (originalGV) {
        window.GraphViewer = function() {
          const inst = new originalGV(...arguments);
          window.capturedViewers.push(inst);
          return inst;
        };
        window.GraphViewer.prototype = originalGV.prototype;
        Object.assign(window.GraphViewer, originalGV);
      }

      // XML Decompression helper
      function decompressDiagram(text) {
        try {
          const binary = atob(text.trim());
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          const decompressed = window.pako.inflateRaw(bytes, { to: 'string' });
          return decodeURIComponent(decompressed);
        } catch (e) {
          console.error("Failed to decompress diagram:", e);
          return null;
        }
      }

      // Multi-Page XML Merger
      function mergeMultiPageXml(xmlStr) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlStr, "application/xml");
        const diagrams = Array.from(doc.getElementsByTagName("diagram"));
        if (diagrams.length <= 1) return xmlStr;

        const firstDiagram = diagrams[0];
        let firstModelStr = firstDiagram.textContent.trim();
        if (!firstModelStr.startsWith("<mxGraphModel>")) {
          firstModelStr = decompressDiagram(firstModelStr) || firstModelStr;
        }
        const firstModelDoc = parser.parseFromString(firstModelStr, "application/xml");
        const firstModel = firstModelDoc.querySelector("mxGraphModel");
        const firstRoot = firstModel.querySelector("root");

        let accumulatedHeight = 0;

        const getPageBounds = (rootEl) => {
          let minY = Infinity, maxY = -Infinity;
          let minX = Infinity, maxX = -Infinity;
          
          rootEl.querySelectorAll("mxCell").forEach(cell => {
            const geo = cell.querySelector("mxGeometry");
            if (geo) {
              const x = parseFloat(geo.getAttribute("x") || "0");
              const y = parseFloat(geo.getAttribute("y") || "0");
              const w = parseFloat(geo.getAttribute("width") || "0");
              const h = parseFloat(geo.getAttribute("height") || "0");
              
              if (w > 0 && h > 0) {
                if (y < minY) minY = y;
                if (y + h > maxY) maxY = y + h;
                if (x < minX) minX = x;
                if (x + w > maxX) maxX = x + w;
              }
            }
          });
          
          return { minY, maxY, minX, maxX };
        };

        const firstBounds = getPageBounds(firstRoot);
        accumulatedHeight = firstBounds.maxY !== -Infinity ? firstBounds.maxY : 1000;

        for (let j = 1; j < diagrams.length; j++) {
          const diag = diagrams[j];
          let modelStr = diag.textContent.trim();
          if (!modelStr.startsWith("<mxGraphModel>")) {
            modelStr = decompressDiagram(modelStr) || modelStr;
          }
          const modelDoc = parser.parseFromString(modelStr, "application/xml");
          const modelEl = modelDoc.querySelector("mxGraphModel");
          if (!modelEl) continue;
          const root = modelEl.querySelector("root");
          if (!root) continue;

          const bounds = getPageBounds(root);
          if (bounds.minY === Infinity) continue; // Empty page

          const pageHeight = bounds.maxY - bounds.minY;
          const shiftY = accumulatedHeight - bounds.minY + 300;
          const prefix = "p" + j + "_";

          const cells = Array.from(root.querySelectorAll("mxCell"));
          cells.forEach(cell => {
            const id = cell.getAttribute("id");
            if (id === "0" || id === "1") return;

            cell.setAttribute("id", prefix + id);

            const parent = cell.getAttribute("parent");
            if (parent && parent !== "0" && parent !== "1") {
              cell.setAttribute("parent", prefix + parent);
            } else if (!parent || parent === "1") {
              cell.setAttribute("parent", "1");
            }

            const source = cell.getAttribute("source");
            if (source && source !== "0" && source !== "1") {
              cell.setAttribute("source", prefix + source);
            }

            const target = cell.getAttribute("target");
            if (target && target !== "0" && target !== "1") {
              cell.setAttribute("target", prefix + target);
            }

            const geo = cell.querySelector("mxGeometry");
            if (geo) {
              const y = parseFloat(geo.getAttribute("y") || "0");
              geo.setAttribute("y", (y + shiftY).toString());

              geo.querySelectorAll("mxPoint").forEach(pt => {
                const py = pt.getAttribute("y");
                if (py) {
                  pt.setAttribute("y", (parseFloat(py) + shiftY).toString());
                }
              });
            }

            const importedCell = firstModelDoc.importNode(cell, true);
            firstRoot.appendChild(importedCell);
          });

          accumulatedHeight += pageHeight + 300;
        }

        firstDiagram.textContent = "";
        const serializedModel = new XMLSerializer().serializeToString(firstModel);
        const modelNode = doc.importNode(new DOMParser().parseFromString(serializedModel, "application/xml").documentElement, true);
        firstDiagram.appendChild(modelNode);

        for (let j = 1; j < diagrams.length; j++) {
          diagrams[j].parentNode.removeChild(diagrams[j]);
        }

        return new XMLSerializer().serializeToString(doc);
      }

      // Read config, merge multi-pages if needed
      const configStr = decodeURIComponent("${encodedConfigJson}");
      const config = JSON.parse(configStr);
      if (config.xml) {
        config.xml = mergeMultiPageXml(config.xml);
      }

      const element = document.querySelector(".mxgraph");
      element.setAttribute("data-mxgraph", JSON.stringify(config));
      
      if (window.GraphViewer) {
        window.GraphViewer.processElements();
      }
    } catch (e) {
      console.error("Error setting configuration:", e.message || e);
    }
  </script>
</body>
</html>
  `;

  // Load HTML page
  await page.setContent(html, { waitUntil: "load" });

  try {
    // Wait for the viewer script to render the XML to an SVG element in the DOM
    await page.waitForSelector("div.mxgraph svg", { timeout: 20000 });

    // Additional robust stability check: ensure the SVG element has stabilized with non-zero geometry
    await page.waitForFunction(
      () => {
        const svg = document.querySelector("div.mxgraph svg");
        if (!svg) return false;
        const rect = svg.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          svg.querySelectorAll("g, rect, path, text").length > 0
        );
      },
      { timeout: 20000 },
    );

    // Small delay to ensure all transition/rendering effects are fully resolved
    await new Promise((resolve) => setTimeout(resolve, 500));
  } catch (err: any) {
    throw new Error(
      `Failed to render Draw.io diagram in browser: ${err.message}`,
    );
  }

  // Retrieve and calculate bounds, validate diagram structure, and retry if necessary
  let validationResult: any = null;
  let attempt = 0;
  const maxAttempts = 6;
  const envPadding = process.env.ERD_PADDING
    ? parseInt(process.env.ERD_PADDING, 10)
    : 40;
  let customPadding = isNaN(envPadding) ? 40 : envPadding;

  const isWholeDiagram = baseName.includes("whole-er-diagram");
  while (attempt < maxAttempts) {
    validationResult = await page.evaluate(
      ({ paddingVal, isWholeDiagram }) => {
        const graphs = (window as any).capturedGraphs;
        if (!graphs || graphs.length === 0) {
          return { error: "No graphs captured during rendering" };
        }
        const graph = graphs[0];
        const viewer = (window as any).capturedViewers[0];

        if (viewer) {
          viewer.autoFit = false;
          viewer.responsive = false;
          viewer.autoCrop = false;
          viewer.handlingResize = false;
        }

        graph.resizeContainer = false;
        graph.view.setScale(1.0);
        graph.view.setTranslate(0, 0);

        let bounds = graph.getGraphBounds();
        let scale = graph.view.scale; // 1.0

        // Stabilization loop to verify and include all cell boundaries
        for (let iter = 0; iter < 5; iter++) {
          let minX = bounds.x / scale;
          let minY = bounds.y / scale;
          let maxX = (bounds.x + bounds.width) / scale;
          let maxY = (bounds.y + bounds.height) / scale;

          const model = graph.getModel();
          const view = graph.getView();
          const states = view.states;

          states.visit((id: any, state: any) => {
            if (state.cell && state.cell.value) {
              let stateMinX = state.x / scale;
              let stateMinY = state.y / scale;
              let stateMaxX = (state.x + state.width) / scale;
              let stateMaxY = (state.y + state.height) / scale;

              if (stateMinX < minX) minX = stateMinX;
              if (stateMinY < minY) minY = stateMinY;
              if (stateMaxX > maxX) maxX = stateMaxX;
              if (stateMaxY > maxY) maxY = stateMaxY;

              if (state.text) {
                let labelMinX = state.text.x / scale;
                let labelMinY = state.text.y / scale;
                let labelMaxX = (state.text.x + state.text.width) / scale;
                let labelMaxY = (state.text.y + state.text.height) / scale;

                if (labelMinX < minX) minX = labelMinX;
                if (labelMinY < minY) minY = labelMinY;
                if (labelMaxX > maxX) maxX = labelMaxX;
                if (labelMaxY > maxY) maxY = labelMaxY;
              }

              if (state.absolutePoints) {
                state.absolutePoints.forEach((p: any) => {
                  let px = p.x / scale;
                  let py = p.y / scale;
                  if (px < minX) minX = px;
                  if (py < minY) minY = py;
                  if (px > maxX) maxX = px;
                  if (py > maxY) maxY = py;
                });
              }
            }
          });

          const newWidth = maxX - minX;
          const newHeight = maxY - minY;

          if (
            Math.abs(bounds.x - minX * scale) < 1 &&
            Math.abs(bounds.y - minY * scale) < 1 &&
            Math.abs(bounds.width - newWidth * scale) < 1 &&
            Math.abs(bounds.height - newHeight * scale) < 1
          ) {
            break;
          }

          bounds = {
            x: minX * scale,
            y: minY * scale,
            width: newWidth * scale,
            height: newHeight * scale,
          };
        }

        const minX = bounds.x / scale;
        const minY = bounds.y / scale;
        graph.view.setScale(1.0);
        graph.view.setTranslate(-minX + paddingVal, -minY + paddingVal);

        const targetWidth = Math.ceil(bounds.width / scale + paddingVal * 2);
        const targetHeight = Math.ceil(bounds.height / scale + paddingVal * 2);

        const container = graph.container;
        container.style.width = targetWidth + "px";
        container.style.height = targetHeight + "px";

        graph.sizeDidChange();

        const svg = document.querySelector("div.mxgraph svg");
        if (svg) {
          svg.setAttribute("width", targetWidth.toString());
          svg.setAttribute("height", targetHeight.toString());
          svg.setAttribute("viewBox", `0 0 ${targetWidth} ${targetHeight}`);
        }

        // Count entities (table swimlanes) and check if they are fully inside container bounds
        const entities: any[] = [];
        const containers: any[] = [];
        const model = graph.getModel();
        const view = graph.getView();

        for (const id in model.cells) {
          const cell = model.cells[id];
          const state = view.getState(cell);
          if (!state || state.width <= 0 || state.height <= 0) continue;

          if (
            id.startsWith("table_") ||
            id.startsWith("legend_content") ||
            id.startsWith("legend_map_content") ||
            id.startsWith("standalone_")
          ) {
            entities.push({
              id,
              cell,
              x: state.x,
              y: state.y,
              width: state.width,
              height: state.height,
            });
          } else if (
            id.startsWith("mod_") ||
            id.startsWith("column_") ||
            id.startsWith("container_") ||
            id.startsWith("group_") ||
            id.startsWith("legend_container") ||
            id.startsWith("legend_map_container")
          ) {
            containers.push({
              id,
              cell,
              x: state.x,
              y: state.y,
              width: state.width,
              height: state.height,
              isContainer: true,
            });
          }
        }

        const totalEntities = entities.length;
        let visibleEntities = 0;

        entities.forEach((ent) => {
          const inside =
            ent.x >= 0 &&
            ent.y >= 0 &&
            ent.x + ent.width <= targetWidth &&
            ent.y + ent.height <= targetHeight;
          if (inside) {
            visibleEntities++;
          }
        });

        const finalBounds = graph.getGraphBounds();
        const isFullyContained =
          finalBounds.x >= 0 &&
          finalBounds.y >= 0 &&
          finalBounds.x + finalBounds.width <= targetWidth &&
          finalBounds.y + finalBounds.height <= targetHeight;

        // Rendered-geometry checks:
        // 1. Box overlaps (entity tables vs entity tables)
        let boxOverlaps = 0;
        for (let i = 0; i < entities.length; i++) {
          for (let j = i + 1; j < entities.length; j++) {
            const a = entities[i];
            const b = entities[j];
            const xOverlap = Math.max(
              0,
              Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
            );
            const yOverlap = Math.max(
              0,
              Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
            );
            if (xOverlap > 1 && yOverlap > 1) {
              boxOverlaps++;
            }
          }
        }

        // 2. Helper for line-box intersection (edge through entity)
        function segmentIntersectsBoxInterior(
          x1: number,
          y1: number,
          x2: number,
          y2: number,
          box: any,
          margin = 2,
        ): boolean {
          const bx1 = box.x + margin;
          const by1 = box.y + margin;
          const bx2 = box.x + box.width - margin;
          const by2 = box.y + box.height - margin;
          if (bx2 <= bx1 || by2 <= by1) return false;
          if (Math.max(x1, x2) <= bx1 || Math.min(x1, x2) >= bx2) return false;
          if (Math.max(y1, y2) <= by1 || Math.min(y1, y2) >= by2) return false;
          if (Math.abs(y1 - y2) < 0.5) {
            return (
              y1 > by1 &&
              y1 < by2 &&
              Math.min(x1, x2) < bx2 &&
              Math.max(x1, x2) > bx1
            );
          }
          if (Math.abs(x1 - x2) < 0.5) {
            return (
              x1 > bx1 &&
              x1 < bx2 &&
              Math.min(y1, y2) < by2 &&
              Math.max(y1, y2) > by1
            );
          }
          return false;
        }

        // 3. Helper for connector segment running along border
        function segmentRunsAlongBorder(
          x1: number,
          y1: number,
          x2: number,
          y2: number,
          box: any,
          tol = 3,
        ): boolean {
          const minSegLen = 6;
          if (Math.abs(y1 - y2) < 0.5) {
            const segX1 = Math.min(x1, x2);
            const segX2 = Math.max(x1, x2);
            if (segX2 - segX1 < minSegLen) return false;
            if (Math.abs(y1 - box.y) <= tol) {
              const overlap =
                Math.min(segX2, box.x + box.width) - Math.max(segX1, box.x);
              if (overlap >= minSegLen) return true;
            }
            if (Math.abs(y1 - (box.y + box.height)) <= tol) {
              const overlap =
                Math.min(segX2, box.x + box.width) - Math.max(segX1, box.x);
              if (overlap >= minSegLen) return true;
            }
          }
          if (Math.abs(x1 - x2) < 0.5) {
            const segY1 = Math.min(y1, y2);
            const segY2 = Math.max(y1, y2);
            if (segY2 - segY1 < minSegLen) return false;
            if (Math.abs(x1 - box.x) <= tol) {
              const overlap =
                Math.min(segY2, box.y + box.height) - Math.max(segY1, box.y);
              if (overlap >= minSegLen) return true;
            }
            if (Math.abs(x1 - (box.x + box.width)) <= tol) {
              const overlap =
                Math.min(segY2, box.y + box.height) - Math.max(segY1, box.y);
              if (overlap >= minSegLen) return true;
            }
          }
          return false;
        }

        const allBorders = [...entities, ...containers];
        let connectorsValid = true;
        let labelVsEntityOverlaps = 0;
        let edgeThroughEntity = 0;
        let borderOverlap = 0;
        let textClipping = 0;

        for (const id in model.cells) {
          const cell = model.cells[id];
          const state = view.getState(cell);
          if (!state) continue;

          if (state.text) {
            const tx = state.text.x;
            const ty = state.text.y;
            const tw = state.text.width;
            const th = state.text.height;
            if (
              tx < 0 ||
              ty < 0 ||
              tx + tw > targetWidth ||
              ty + th > targetHeight
            ) {
              textClipping++;
              connectorsValid = false;
            }
          }

          if (model.isEdge(cell)) {
            if (state.text && state.text.width > 0 && state.text.height > 0) {
              const lx1 = state.text.x;
              const ly1 = state.text.y;
              const lx2 = lx1 + state.text.width;
              const ly2 = ly1 + state.text.height;
              for (const ent of entities) {
                const xO = Math.max(
                  0,
                  Math.min(lx2, ent.x + ent.width) - Math.max(lx1, ent.x),
                );
                const yO = Math.max(
                  0,
                  Math.min(ly2, ent.y + ent.height) - Math.max(ly1, ent.y),
                );
                if (xO > 1 && yO > 1) {
                  labelVsEntityOverlaps++;
                }
              }
            }

            const pts = state.absolutePoints;
            if (pts && pts.length >= 2) {
              for (const pt of pts) {
                if (
                  pt.x < 0 ||
                  pt.y < 0 ||
                  pt.x > targetWidth ||
                  pt.y > targetHeight
                ) {
                  connectorsValid = false;
                  break;
                }
              }

              const srcCell = cell.getTerminal(true);
              const trgCell = cell.getTerminal(false);
              let srcTableId = "";
              let trgTableId = "";
              let curr = srcCell;
              while (curr) {
                if (curr.id && curr.id.startsWith("table_")) {
                  srcTableId = curr.id;
                  break;
                }
                curr = curr.parent;
              }
              curr = trgCell;
              while (curr) {
                if (curr.id && curr.id.startsWith("table_")) {
                  trgTableId = curr.id;
                  break;
                }
                curr = curr.parent;
              }

              for (let i = 0; i < pts.length - 1; i++) {
                const p1 = pts[i];
                const p2 = pts[i + 1];
                for (const ent of entities) {
                  if (ent.id === srcTableId || ent.id === trgTableId) continue;
                  if (
                    segmentIntersectsBoxInterior(p1.x, p1.y, p2.x, p2.y, ent)
                  ) {
                    edgeThroughEntity++;
                  }
                }
                for (const border of allBorders) {
                  if (segmentRunsAlongBorder(p1.x, p1.y, p2.x, p2.y, border)) {
                    borderOverlap++;
                  }
                }
              }
            }
          }
        }

        return {
          width: targetWidth,
          height: targetHeight,
          totalEntities,
          visibleEntities,
          isFullyContained,
          connectorsValid,
          boxOverlaps,
          labelVsEntityOverlaps,
          edgeThroughEntity,
          borderOverlap,
          textClipping,
          validationPassed:
            visibleEntities === totalEntities &&
            isFullyContained &&
            connectorsValid &&
            (isWholeDiagram
              ? boxOverlaps === 0 &&
                labelVsEntityOverlaps === 0 &&
                edgeThroughEntity === 0 &&
                borderOverlap === 0 &&
                textClipping === 0
              : true),
        };
      },
      { paddingVal: customPadding, isWholeDiagram },
    );

    if (validationResult.error) {
      throw new Error(validationResult.error);
    }

    console.log(
      `[Rendered Geometry Check] entities=${validationResult.visibleEntities}/${validationResult.totalEntities}, boxOverlaps=${validationResult.boxOverlaps}, labelOverlaps=${validationResult.labelVsEntityOverlaps}, edgeThroughEntity=${validationResult.edgeThroughEntity}, borderOverlap=${validationResult.borderOverlap}, textClipping=${validationResult.textClipping}`,
    );

    if (validationResult.validationPassed) {
      break;
    }

    console.warn(
      `Validation failed on attempt ${attempt + 1}. Visible entities: ${validationResult.visibleEntities}/${validationResult.totalEntities}. Fully contained: ${validationResult.isFullyContained}. Connectors valid: ${validationResult.connectorsValid}. Retrying with padding ${customPadding + 20}...`,
    );
    customPadding += 20;
    attempt++;
  }

  if (
    attempt >= maxAttempts ||
    !validationResult ||
    !validationResult.validationPassed
  ) {
    throw new Error(
      `Diagram validation failed for ${baseName}: visibleEntities=${validationResult?.visibleEntities}/${validationResult?.totalEntities}, isFullyContained=${validationResult?.isFullyContained}, connectorsValid=${validationResult?.connectorsValid}, boxOverlaps=${validationResult?.boxOverlaps}, labelOverlaps=${validationResult?.labelVsEntityOverlaps}, edgeThroughEntity=${validationResult?.edgeThroughEntity}, borderOverlap=${validationResult?.borderOverlap}, textClipping=${validationResult?.textClipping} after ${maxAttempts} attempts.`,
    );
  }

  const dimensions = {
    width: validationResult.width,
    height: validationResult.height,
  };

  // 1. Export SVG
  let svgHtml = await page.evaluate(() => {
    const svg = document.querySelector("div.mxgraph svg");
    return svg ? svg.outerHTML : "";
  });

  if (svgHtml) {
    const isDark = process.env.ERD_THEME === "dark";
    svgHtml = ensureSvgNamespaces(svgHtml);
    svgHtml = resolveLightDark(svgHtml, isDark);
    svgHtml = applyFontFallbacks(svgHtml);

    const svgFileContent = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n${svgHtml}`;
    fs.writeFileSync(svgPath, svgFileContent, "utf8");
    console.log(`-> Generated SVG: ${svgPath}`);
  }

  // Configure high-DPI resolution viewport dynamically based on diagram size
  let scaleFactor = 4.0;
  if (process.env.ERD_SCALE) {
    scaleFactor = parseFloat(process.env.ERD_SCALE);
  }

  // Cap on the PNG's longest side: default 16,000 px (env ERD_MAX_PNG_SIDE overrides)
  const maxPngSide = process.env.ERD_MAX_PNG_SIDE
    ? parseFloat(process.env.ERD_MAX_PNG_SIDE)
    : 16000;
  const maxDimension = Math.max(dimensions.width, dimensions.height);
  if (maxDimension * scaleFactor > maxPngSide) {
    const originalScale = scaleFactor;
    scaleFactor = Math.max(0.5, maxPngSide / maxDimension);
    console.warn(
      `[Scale Warning] Longest dimension (${maxDimension}px * ${originalScale.toFixed(2)}x = ${Math.round(maxDimension * originalScale)}px) exceeds ${maxPngSide}px limit. Reducing scale from ${originalScale.toFixed(2)}x to ${scaleFactor.toFixed(2)}x (Final pixel size: ${Math.round(dimensions.width * scaleFactor)}x${Math.round(dimensions.height * scaleFactor)} px).`,
    );
  }

  await page.setViewport({
    width: dimensions.width,
    height: dimensions.height,
    deviceScaleFactor: scaleFactor,
  });

  const finalWidth = Math.round(dimensions.width * scaleFactor);
  const finalHeight = Math.round(dimensions.height * scaleFactor);

  // 2. Export PNG
  try {
    if (finalWidth > 4000 || finalHeight > 4000) {
      // Capture the page in tiles using page.screenshot({ clip })
      const maxTileDevicePx = 4000;
      const tileCssMax = Math.max(
        100,
        Math.floor(maxTileDevicePx / scaleFactor),
      );
      const tiles: { x: number; y: number; width: number; height: number }[] =
        [];
      for (let y = 0; y < dimensions.height; y += tileCssMax) {
        const h = Math.min(tileCssMax, dimensions.height - y);
        for (let x = 0; x < dimensions.width; x += tileCssMax) {
          const w = Math.min(tileCssMax, dimensions.width - x);
          tiles.push({ x, y, width: w, height: h });
        }
      }

      const compositeInputs: { input: Buffer; left: number; top: number }[] =
        [];
      for (const tile of tiles) {
        const tileBuf = await page.screenshot({
          type: "png",
          clip: {
            x: tile.x,
            y: tile.y,
            width: tile.width,
            height: tile.height,
          },
          omitBackground: false,
        });
        compositeInputs.push({
          input: Buffer.from(tileBuf),
          left: Math.round(tile.x * scaleFactor),
          top: Math.round(tile.y * scaleFactor),
        });
      }

      const isDark = process.env.ERD_THEME === "dark";
      const bgRgb = isDark
        ? { r: 15, g: 23, b: 42, alpha: 1 }
        : { r: 255, g: 255, b: 255, alpha: 1 };

      await sharp({
        create: {
          width: finalWidth,
          height: finalHeight,
          channels: 4,
          background: bgRgb,
        },
        limitInputPixels: false,
      })
        .composite(compositeInputs)
        .withMetadata({ density: 300 })
        .toFile(pngPath);
    } else {
      const buffer = await page.screenshot({
        type: "png",
        clip: {
          x: 0,
          y: 0,
          width: dimensions.width,
          height: dimensions.height,
        },
        omitBackground: false,
      });
      await sharp(Buffer.from(buffer), { limitInputPixels: false })
        .withMetadata({ density: 300 })
        .toFile(pngPath);
    }
    console.log(
      `-> Generated PNG (${scaleFactor.toFixed(2)}x, ${finalWidth}x${finalHeight} px): ${pngPath}`,
    );

    // Regression guard: verify diagram is not truncated by checking content reaches near the bottom
    const rawPng = await sharp(pngPath).raw().toBuffer();
    const pngMeta = await sharp(pngPath).metadata();
    const channels = pngMeta.channels || 3;
    const isDark = process.env.ERD_THEME === "dark";
    const isBgPixel = isDark
      ? (r: number, g: number, b: number) => r <= 25 && g <= 35 && b <= 55
      : (r: number, g: number, b: number) => r >= 250 && g >= 250 && b >= 250;
    let lastContentY = -1;
    for (let y = finalHeight - 1; y >= 0; y -= 2) {
      let rowHasContent = false;
      for (let x = 0; x < finalWidth; x += 4) {
        const idx = (y * finalWidth + x) * channels;
        const r = rawPng[idx],
          g = rawPng[idx + 1],
          b = rawPng[idx + 2];
        if (!isBgPixel(r, g, b)) {
          rowHasContent = true;
          break;
        }
      }
      if (rowHasContent) {
        lastContentY = y;
        break;
      }
    }
    const lastCanvasY = lastContentY / scaleFactor;
    if (baseName.includes("whole-er-diagram") || dimensions.height > 1000) {
      if (lastCanvasY < dimensions.height - 180) {
        throw new Error(
          `[Regression Guard Failure] PNG truncation detected for ${baseName}: content stops at canvas Y ${Math.round(lastCanvasY)} (expected >= ${dimensions.height - 180}, total canvas height: ${dimensions.height}).`,
        );
      }
    }
  } catch (pngErr: any) {
    console.error(
      `-> Failed to generate PNG for ${baseName}: ${pngErr.message}`,
    );
    throw pngErr;
  }

  // 3. Export PDF with matching custom dimensions
  try {
    await page.pdf({
      path: pdfPath,
      width: `${dimensions.width}px`,
      height: `${dimensions.height}px`,
      printBackground: true,
      pageRanges: "1",
      margin: {
        top: "0px",
        right: "0px",
        bottom: "0px",
        left: "0px",
      },
    });
    console.log(`-> Generated PDF: ${pdfPath}`);
  } catch (pdfErr: any) {
    console.error(
      `-> Failed to generate PDF for ${baseName}: ${pdfErr.message}`,
    );
    throw pdfErr;
  }

  // 4. Headless Chrome SVG verification
  if (baseName.includes("whole-er-diagram")) {
    try {
      const svgPage = await page.browser().newPage();
      const svgContent = fs.readFileSync(svgPath, "utf8");
      await svgPage.setContent(
        `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#ffffff;">${svgContent}</body></html>`,
      );
      const svgVerification = await svgPage.evaluate(() => {
        const svgEl = document.querySelector("svg");
        if (!svgEl) return null;
        const w = parseFloat(svgEl.getAttribute("width") || "0");
        const h = parseFloat(svgEl.getAttribute("height") || "0");
        const bbox = svgEl.getBBox();
        return {
          w,
          h,
          bbox: {
            x: Math.round(bbox.x),
            y: Math.round(bbox.y),
            width: Math.round(bbox.width),
            height: Math.round(bbox.height),
          },
        };
      });
      if (svgVerification) {
        console.log(
          `[SVG Verification] Loaded SVG in headless Chrome: dimensions=${svgVerification.w}x${svgVerification.h}, entityCount=${validationResult.totalEntities}, matches PDF/graph bounds: width=${dimensions.width}, height=${dimensions.height}.`,
        );
      }
      await svgPage.close();
    } catch (svgErr: any) {
      console.warn(`[SVG Verification Warning] ${svgErr.message}`);
    }
  }
}

async function main() {
  // ERD_OUTPUT_DIR overrides the default docs/erd/modules path (same env var as generate-erd.ts).
  const projectRoot = path.resolve(__dirname, "..");
  const outputDirEnv = process.env.ERD_OUTPUT_DIR;
  const erdDir = outputDirEnv
    ? path.isAbsolute(outputDirEnv)
      ? outputDirEnv
      : path.resolve(projectRoot, outputDirEnv)
    : path.join(projectRoot, "docs", "erd", "modules");
  if (!fs.existsSync(erdDir)) {
    console.error(`ERD modules directory not found at: ${erdDir}`);
    process.exit(1);
  }

  let drawioFiles = getDrawioFiles(erdDir);
  const targetModule = process.argv[2];
  if (targetModule) {
    drawioFiles = drawioFiles.filter((f) =>
      f.split(path.sep).includes(targetModule),
    );
  }
  console.log(`Found ${drawioFiles.length} Draw.io diagram files to render.`);

  if (drawioFiles.length === 0) {
    console.log("No diagrams to render.");
    process.exit(0);
  }

  const startTime = Date.now();

  // Launch headless browser
  console.log("Launching headless browser to render diagrams...");
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    for (const file of drawioFiles) {
      let page: Page | null = null;
      try {
        page = await browser.newPage();

        // Listen for browser logs & errors to ease debugging
        page.on("console", (msg) => {
          const text = msg.text();
          const type = msg.type() as string;
          // Ignore routine logs to avoid cluttering, but log errors/warnings
          if (
            type === "error" ||
            type === "warning" ||
            text.includes("error") ||
            text.includes("fail")
          ) {
            console.log(`[Browser Console] ${type.toUpperCase()}: ${text}`);
          }
        });
        page.on("pageerror", (err: any) => {
          console.error(`[Browser PageError]: ${err.message}`);
        });

        await renderDrawio(page, file);
      } catch (err: any) {
        console.error(`Error rendering diagram for ${file}:`, err.message);
      } finally {
        if (page) {
          try {
            await page.close();
          } catch (e) {}
        }
      }
    }
  } finally {
    await browser.close();
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(
    `\nDraw.io rendering process completed successfully in ${duration} seconds.`,
  );
}

main();
