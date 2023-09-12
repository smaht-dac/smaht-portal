/**
 * Returns the mouse position within an SVG element coordinate system (as
 * opposed to the screen's coordinate system) using the svg.getScreenCTM()
 * function, and returns the current transformation matrix.
 * 
 * Assumes that the 
 * @param {*} e JavaScript event
 * @param {*} svg the svg element that the click occured in
 * @returns the position
 * 
 * Disclaimer: Code is based on an example by Peter Collingridge in the 
 * following post
 * https://www.petercollingridge.co.uk/tutorials/svg/interactive/dragging/
 */

export const getMousePosition = (e, svg) => {
    const CTM = svg.getScreenCTM();
    
    return {
      x: (e.clientX - CTM.e) / CTM.a,
      y: (e.clientY - CTM.f) / CTM.d
    };
}
