/**
 *
 *
 */
function copyToClipboard(text) {
	let dummy = document.createElement("textarea")
	document.body.appendChild(dummy)
	dummy.value = text
	dummy.select()
	document.execCommand("copy")
	document.body.removeChild(dummy)
}

/**
 * Draws a synthaser plot.
 * Cameron L.M. Gilchrist, 2020
 */
export default function synthaser() {
  // Constants
	let barHeight = 20
	let cellHeight = 20
	let cellPadding = 0.3
	let headWidth = 10
	let plotWidth = 600
  let cellWidth = 30
  let legendFontSize = 12
  let titleFontSize = 16
  let transitionDuration = 250
  let xLabelFontSize = 14
  let yAxisGap = 10
  let yAxisPadding = 0.4
  let yLabelFontSize = 12

  // Define all of our scales...
  let scales = {
    x: d3.scaleLinear(),
    y: d3.scaleBand(),
    scheme: d3.scaleSequential(d3.interpolateRainbow),
    colour: d3.scaleOrdinal(),
    legend: d3.scaleBand(),
    order: d3.scaleOrdinal(),
  }

  // Important plot stuff
  // points - point strs used in both clip path and synthase polygons
  // plotEnd - right-most edge of plot, used for legend transformation
  const points = {}
  let plotEnd
  let t

  // Store the plot container and implement an update function so we
  // can trigger updates with new data from within the plot.
  let container
  const update = data => {
    if (!data) return container.call(my)
    return container.data([data]).call(my)
  }

  /**
   * Get all unique property values in sequence domains.
   * @param {Object} data - synthaser data object
   * @param {String} prop - domain property to extract
   */
  function getUniqueDomainProps(data, prop="type") {
    return [
      ...data.order.map(h => {
        let doms = data.synthases[h].domains.map(d => d[prop])
        return new Set(doms)
      }).reduce((one, two) => new Set([...one, ...two]))
    ]
  }

  /**
   * Function for calculating points of each sequence polygon.
   * @param {Object} d - synthase data object
   */
	function calculatePoints(d) {
		let wide = scales.x(d.sequence.length)
		let head = wide - headWidth
    let bwidth = scales.y.bandwidth()
		let path = `
			0,0
			${head},0
			${wide},${bwidth / 2}
			${head},${bwidth}
			0,${bwidth}
		`
		return path
	}

  /**
   * Update function for selection of Synthases.
   * @param {d3.selection} selection - a collection of synthases
   */
  function updateSynthases(selection, data) {
    selection.attr("transform", d => `translate(0, ${scales.y(d)})`)
    selection.selectAll("rect.seq-bg")  
      .attr("width", s => scales.x(data.synthases[s].sequence.length))
      .attr("height", scales.y.bandwidth())
    selection.selectAll("rect.domain")
      .attr("x", d => scales.x(d.start))
      .attr("fill", d => scales.colour(d.type))
      .attr("width", d => scales.x(d.end - d.start))
      .attr("height", scales.y.bandwidth())
    selection.selectAll("polygon")
      .attr("points", s => points[s])
  }

  /**
   * Returns a copy of an object without specific properties.
   * @param {Object} obj - Object to filter
   * @param {Array} props - Array of properties to remove
   */
  function removeProps(obj, props) {
    return Object.fromEntries(
      Object.keys(obj)
        .filter(p => !props.includes(p))
        .map(p => [ p, obj[p] ])
    )
  }

  /**
   * Remove a sequence from the data object.
   * @param {Object} data - synthaser data object
   * @param {String} query - name of synthase to remove
   */
  function removeSequence(query, data) {
    // Create new data object.
    // 1. Remove sequence from order property
    // 2. Remove sequence from any classification groups (& remove empty)
    // 3. Remove sequence from synthases property
    let synth = data.synthases[query]
    let newData = {
      ...data,
      "order": data.order.filter(q => q != query),
      "types": {
        ...removeProps(data.types, synth.classification),
        ...Object.fromEntries(
          synth.classification
            .map(c => [c, data.types[c].filter(q => q != query)])
            .filter(c => c[1].length > 0)
        )
      },
      "synthases": { ...removeProps(data.synthases, [query]) },
      "groups": data.groups.map(group => group.map(g => g))
    }
    // Prune classification groups:
    // 1. Delete specific classification if no sequences left
    // 2. Delete group in data.groups if now empty
    for (let [index, group] of newData.groups.entries()) {
      for (let [j, g] of group.entries()) {
        if (synth.classification.includes(g.classification)) {
          if (!newData.types.hasOwnProperty(g.classification))
            newData.groups[index].splice(j, 1)
          if (newData.groups[index].length == 0)
            newData.groups.splice(index, 1)
        }
      }
    }
    return newData
  }

  /**
   * Update annotation group positioning.
   * @param {d3.selection} selection - annotation group selection
   * @param {Object} data - synthaser data object
   */
  function updateAnnotations(selection, data) {
    let offsets
    let previous

    selection.each((group, i, n) => {
      if (i === 0) {
        previous = 0
        offsets = []
      }

      // Check for empty groups
      let synthases = data.types[group.classification]
      if (synthases.length == 0) return

      // If we've moved laterally, delete the last offset value.
      if (offsets && group.depth === previous)
        offsets.pop()

      // Calculate all the points of the bracket. Note that startX includes the
      // sum of all previous computed offsets, to allow for arbitrary level of
      // annotation nesting.
      let startX = (
        d3.max(synthases.map(s => scales.x(data.synthases[s].sequence.length))) + 10
        + d3.sum(offsets)
      )
      let endX = startX + 10
      let yPos = synthases.map(s => scales.y(s))
      let topY = d3.min(yPos)
      let botY = d3.max(yPos) + scales.y.bandwidth()
      let midY = botY + (topY - botY) / 2

      // Add a new group, containing the bracket path and the classification
      // text.
      selection.selectAll("polyline")
        .filter(g => g === group)
        .attr("points", `
          ${startX},${topY}
          ${endX},${topY}
          ${endX},${botY}
          ${startX},${botY}
        `)
      selection.selectAll("text")
        .filter(g => g === group)
        .style("font-size", `${12}px`)
        .attr("x", endX + 10)
        .attr("y", midY)

      // Add the total width of the added part to the array of previous offsets,
      // then set the depth.
      let blah = d3.select(n[i]).node()
      let bbox = blah.getBBox()
      let offset = bbox.width + 6
      offsets.push(offset)
      previous = group.depth

      // Keep track of right-most edge of plot so we can reposition legend
      let rightEnd = endX + offset
      if (rightEnd > plotEnd) plotEnd = rightEnd
    })
  }

  /**
   * Update legend element positioning.
   * @param {d3.selection} selection - legend selection
   */
  function updateLegend(selection) {
    selection.attr("transform", d => `translate(0, ${scales.legend(d)})`)
    selection.selectAll("rect")
      .attr("fill", d => scales.colour(d))
      .attr("width", cellWidth)
      .attr("height", scales.legend.bandwidth())
    selection.selectAll("text")
      .attr("x", cellWidth)
      .attr("y", scales.legend.bandwidth() / 2)
      .style("font-size", `${legendFontSize}px`)
    return selection
  }

  /**
   * Pick a new colour for a domain.
   * @param {d3.event} d - click event with domain name
   */
  function changeDomainColour(_, d) {
    let picker = d3.select("input#picker")
    picker.on("change", () => {
      d3.selectAll(`.${d}`)
        .attr("fill", picker.node().value)
    })
    picker.node().click()
  }

  /**
   * Generates the HTML content for a cell hovering tooltip.
   * It provides the name of the query, as well as a table of each hit.
   * @param {Object} d - domain data object
   * @param {Object} data - synthaser data object
   */
  function getTooltipHTML(d) {
    let cddUrl = "https://www.ncbi.nlm.nih.gov/Structure/cdd/cddsrv.cgi?uid="
    return `
    <p class="tooltip-summary">
      <span><b>${d.parent}: ${d.type}</b></span>
    </p>
    <table class="tooltip-hits">
    <tbody>
      <tr>
        <td><b>Family</b></td>
        <td><a href="${cddUrl}${d.accession}">${d.domain}</a></td>
      </tr>
      <tr>
        <td><b>Superfamily</b></td>
        <td><a href="${cddUrl}${d.superfamily}">${d.superfamily}</a></td>
      </tr>
      <tr>
        <td><b>Class</b></td>
        <td>${d.type}</td>
      </tr>
      <tr>
        <td><b>Position</b></td>
        <td>${d.start}-${d.end}</td>
      </tr>
      <tr>
        <td><b>E-value</b></td>
        <td>${d.evalue}</td>
      </tr>
      <tr>
        <td><b>Bitscore</b></td>
        <td>${d.bitscore}</td>
      </tr>
      <tr>
      <td colspan=2>
        <b>Copy sequence:</b>
        <br>
        <button id="dl-domain" style="margin-bottom: 2px"></button>
        <br>
        <button id="dl-parent"></button>
      </td>
      </tr>
    </tbody>
    </table>
    `
  }

  function my(selection) {
    selection.each(function(data) {
      // Get the container
      container = d3.select(this)
      t = d3.transition()
        .duration(transitionDuration)
      plotEnd = 0

      // Update domain-based scales
      let domains = getUniqueDomainProps(data)
      scales.colour.domain(domains)
        .range(domains.map((_, i) => scales.scheme(i / domains.length)))
      scales.order.domain(domains)
        .range(domains.map((_, i) => i / domains.length))

      // Update x/y scales based on data
      let maxSeq = d3.max(data.order.map(h => data.synthases[h].sequence.length))
      scales.x
        .domain([0, maxSeq])
        .range([0, plotWidth])
      scales.y
        .padding(yAxisPadding)
        .domain(data.order)
        .range([0, data.order.length * barHeight])

      // Calculate points for each synthase
      data.order.forEach(header => {
        points[header] = calculatePoints(data.synthases[header])

        // Tell each domain its parent
        data.synthases[header].domains.forEach(d => {
          d["parent"] = header
          d["pLength"] = data.synthases[header].sequence.length
        })
      })

      /**
       * Populates tooltip with current cell data, and adjusts position to match 
       * the cell in the heatmap (ignoring <g> transforms).
      */
      const cellEnter = (event, d) => {
        let tooltip = d3.select("div.tooltip")
        let html = getTooltipHTML(d)
        let pSequence = data.synthases[d.parent].sequence
        let dSequence = pSequence.slice(d.start, d.end)
        tooltip.html(html)
        tooltip.select("#dl-domain")
          .on("click", () => copyToClipboard(dSequence))
          .text(`Domain (${dSequence.length}aa)`)
        tooltip.select("#dl-parent")
          .on("click", () => copyToClipboard(pSequence))
          .text(`Protein (${pSequence.length}aa)`)
        let rect = event.target.getBoundingClientRect()
        let bbox = tooltip.node().getBoundingClientRect()
        let xOffset = rect.width / 2 - bbox.width / 2
        let yOffset = rect.height * 1.2
        tooltip
          .style("left", rect.x + xOffset + "px")
          .style("top", rect.y + yOffset + "px")
        tooltip.transition()
          .duration(100)
          .style("opacity", 1)
          .style("pointer-events", "all")
      }

      /**
       * Transition upon entering the tooltip <div>.
       * This cancels out a previously called transition (i.e. delayed transition
       * in tooltipLeave). Also enables pointer events to allow text selection,
       * clicking hyperlinks, etc.
       */
      const tooltipEnter = () => {
        let tooltip = d3.select("div.tooltip")
        tooltip.transition()
          .duration(0)
          .style("opacity", 1)
          .style("pointer-events", "all")
      }

      /**
       * Delayed tooltip transition for either 1) when user has left heatmap cell
       * and does not go into another, or 2) user entered tooltip <div> and has now
       * left it. Hides tooltip after 400ms, and disables pointer events which would
       * swallow pan/zoom events.
       */
      const tooltipLeave = () => {
        let tooltip = d3.select("div.tooltip")
        tooltip.transition()
          .delay(400)
          .style("opacity", 0)
          .style("pointer-events", "none")
      }


      // Sketch out the chart skeleton
      let plot = container.selectAll("svg.synthaserPlot")
        .data([data])
        .join(
          enter => {
            // Add the colour picker to the root <div>
            enter.append("input")
              .attr("id", "picker")
              .attr("type", "color")
              .style("position", "absolute")
              .style("opacity", 0)

            enter.append("div")
              .attr("class", "tooltip")
              .style("opacity", 0)
              .style("pointer-events", "none")
              .style("position", "absolute")
              .style("padding", "5px")
              .on("mouseenter", tooltipEnter)
              .on("mouseleave", tooltipLeave)

            // Add the <svg> element
            let svg = enter.append("svg")
              .attr("id", "root_svg")
              .classed("wrapper-svg", true)
              .attr("width", "100%")
              .attr("height", "100%")
              .attr("class", "synthaserPlot")
              .attr("cursor", "grab")
              .attr("xmlns", "http://www.w3.org/2000/svg")
              .attr("xmlns:xhtml", "http://www.w3.org/1999/xhtml")
            svg.append("defs")

            // Figure skeleton
            let g = svg.append("g")
              .attr("class", "synthaserPlotG")
            g.append("text")
              .attr("class", "title")
              .attr("text-anchor", "middle")
              .style("font-weight", "bold")
            g.append("text")
              .attr("class", "xLabel")
              .text("Sequence length (amino acids)")
            g.append("g").attr("class", "legend")
            g.append("g").attr("class", "synthases")
            g.append("g").attr("class", "xAxis")
            g.append("g").attr("class", "yAxis")
            g.append("g").attr("class", "annotations")

            // Add pan/zoom behaviour
            let zoom = d3.zoom()
              .scaleExtent([0, 8])
              .on("zoom", event => g.attr("transform", event.transform))
              .on("start", () => svg.attr("cursor", "grabbing"))
              .on("end", () => svg.attr("cursor", "grab"))

            return svg.call(zoom)
          }
        )

      // Add <clipPath> elements for each synthase
      plot.selectAll("defs")
        .selectAll("clipPath")
        .data(data.order, s => `${s}-clip-group`)
        .join(
          enter => enter.append("clipPath")
            .attr("id", s => `${s}-clip`)
            .append("polygon")
            .attr("points", s => points[s]),
          update => update.call(
            update => {
              return update.selectAll("polygon")
                .transition(t)
                .attr("points", s => points[s])
            }
          )
        )

      let g = plot.selectAll("g.synthaserPlotG")
      let synthases = g.selectAll("g.synthases")

      // Draw sequence bar groups
      synthases.selectAll("g.synthaseG")
        .data(data.order, s => s)
        .join(
          enter => {
            enter = enter.append("g")
              .attr("class", "synthaseG")
            let inner = enter.append("g")
              .attr("clip-path", s => `url(#${s}-clip)`)
            inner.append("rect")
              .attr("class", "seq-bg")
              .attr("fill", "white")
            inner.append("g")
              .attr("class", "domains")
              .selectAll("rect.domain")
              .data(s => data.synthases[s].domains)
              .join("rect")
              .attr("class", d => `${d.type} domain`)
              .on("mouseenter", cellEnter)
              .on("mouseleave", tooltipLeave)
            enter.append("polygon")
              .attr("fill", "none")
              .attr("stroke", "black")
              .attr("stroke-width", "thin")
            return enter.call(updateSynthases, data)
          },
          update => update.call(
            update => update.transition(t).call(updateSynthases, data)
          )
        )

      // Draw annotations
      let annotations = g.selectAll("g.annotations")
        .selectAll("g.groups")
        .data(data.groups, d => d.map(c => c.classification).join())
        .join("g")
        .attr("class", "groups")

      annotations.selectAll("g.group")
        .data(g => g, g => g.classification)
        .join(
          enter => {
            enter = enter.append("g")
              .attr("class", "group")
              .attr("id", g => g.classification)
            enter.append("polyline")
              .attr("fill", "none")
              .attr("stroke", "black")
              .attr("stroke-width", "thin")
            enter.append("text")
              .text(g => g.classification)
              .attr("text-anchor", "start")
              .attr("dy", "0.3em")
            return enter.call(updateAnnotations, data)
          },
          update => update.call(
            update => update.transition(t)
              .call(updateAnnotations, data)
          )
        )

      // Update legend scale
      scales.legend
        .domain(domains.sort((a, b) => scales.order(a) > scales.order(b)))
        .range([0, cellHeight * domains.length])
        .paddingInner(cellPadding)

      // Draw the legend
      g.selectAll("g.legend")
        .selectAll("g.legendElement")
        .data(domains, d => d)
        .join(
          enter => {
            enter = enter.append("g")
              .attr("class", "legendElement")
            enter.append("rect")
              .attr("class", d => d)
              .attr("cursor", "pointer")
              .on("click", changeDomainColour)
            enter.append("text")
              .text(d => d)
              .attr("dx", ".4em")
              .attr("text-anchor", "start")
              .style("dominant-baseline", "middle")
            return enter.call(updateLegend)
          },
          update => update.call(
            update => update.transition(t)
              .call(updateLegend)
          )
        )

      // Draw x-axis
      g.selectAll("g.xAxis")
        .transition(t)
        .attr("transform", `translate(0, ${barHeight * data.order.length})`)
        .call(d3.axisBottom(scales.x).ticks(6))

      // Draw y-axis
      let yAxis = g.selectAll("g.yAxis")
      yAxis.transition(t)
        .call(d3.axisLeft(scales.y).tickSize(0).tickPadding(yAxisGap))
      yAxis.selectAll("text")
        .on("click", (_, d) => {
          let newData = removeSequence(d, data)
          update(newData)
        })
        .style("font-size", () => `${yLabelFontSize}px`)
        .style("text-anchor", "end")
      yAxis.selectAll("path").remove()

      // Reposition title
      plot.select("text.title")
        .transition(t)
        .text(`Domain architecture of ${data.order.length} sequences`)
        .attr("x", scales.x(maxSeq) / 2)
        .style("font-size", `${titleFontSize}px`)

      // Reposition bottom label
      plot.select("text.xLabel")
        .transition(t)
        .attr("text-anchor", "middle")
        .attr("x", scales.x(maxSeq) / 2)
        .attr("y", barHeight * data.order.length + 40)
        .style("font-size", `${xLabelFontSize}px`)

      // Reposition figure legend
      let midPoint = scales.y(data.order[data.order.length - 1]) / 2 - scales.legend.range()[1] / 2
      plot.select("g.legend")
        .transition(t)
        .attr("transform", `translate(${plotEnd}, ${midPoint})`)
    })
  }

  // Setters and getters
	my.barHeight = _ => _ !== undefined ? (barHeight = _, my) : barHeight
	my.cellHeight = _ => _ !== undefined ? (cellHeight = _, my) : cellHeight
	my.cellPadding = _ => _ !== undefined ? (cellPadding = _, my) : cellPadding
	my.cellWidth = _ => _ !== undefined ? (cellWidth = _, my) : cellWidth
	my.headWidth = _ => _ !== undefined ? (headWidth = _, my) : headWidth
	my.legendFontSize = _ => _ !== undefined ? (legendFontSize = _, my) : legendFontSize
	my.plotWidth = _ => _ !== undefined ? (plotWidth = _, my) : plotWidth
	my.titleFontSize = _ => _ !== undefined ? (titleFontSize = _, my) : titleFontSize
	my.transitionDuration = _ => _ !== undefined ? (transitionDuration = _, my) : transitionDuration
	my.xLabelFontSize = _ => _ !== undefined ? (xLabelFontSize = _, my) : xLabelFontSize
	my.yLabelFontSize = _ => _ !== undefined ? (yLabelFontSize = _, my) : yLabelFontSize
	my.yAxisGap = _ => _ !== undefined ? (yAxisGap = _, my) : yAxisGap
	my.yAxisPadding = _ => _ !== undefined ? (yAxisPadding = _, my) : yAxisPadding

  return my
}
