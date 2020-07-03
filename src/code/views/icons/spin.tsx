import React from "react"


export const Spinner = ({size=100, fill="#000"}) => {
  return(
    <svg
      width={`${size}px`}
      height={`${size}px`}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${size} ${size}`}
      preserveAspectRatio="xMidYMid"
      className="uil-spin">
      <rect x="0" y="0" width={size} height={size} fill="none" className="bk"></rect>
      <g transform="translate(50 50)">
        <g transform="rotate(0) translate(34 0)">
          <circle cx="0" cy="0" r="8" fill={fill}>
            <animate attributeName="opacity" from="1" to="0.1" begin="0s" dur="1s" repeatCount="indefinite"></animate>
            <animateTransform attributeName="transform" type="scale" from="1.5" to="1" begin="0s" dur="1s" repeatCount="indefinite"></animateTransform>
          </circle>
        </g>
        <g transform="rotate(45) translate(34 0)">
          <circle cx="0" cy="0" r="8" fill={fill}>
            <animate attributeName="opacity" from="1" to="0.1" begin="0.12s" dur="1s" repeatCount="indefinite"></animate>
            <animateTransform attributeName="transform" type="scale" from="1.5" to="1" begin="0.12s" dur="1s" repeatCount="indefinite"></animateTransform>
          </circle>
        </g>
        <g transform="rotate(90) translate(34 0)">
          <circle cx="0" cy="0" r="8" fill={fill}>
            <animate attributeName="opacity" from="1" to="0.1" begin="0.25s" dur="1s" repeatCount="indefinite"></animate>
            <animateTransform attributeName="transform" type="scale" from="1.5" to="1" begin="0.25s" dur="1s" repeatCount="indefinite"></animateTransform>
          </circle>
        </g>
        <g transform="rotate(135) translate(34 0)">
          <circle cx="0" cy="0" r="8" fill={fill}>
            <animate attributeName="opacity" from="1" to="0.1" begin="0.37s" dur="1s" repeatCount="indefinite"></animate>
            <animateTransform attributeName="transform" type="scale" from="1.5" to="1" begin="0.37s" dur="1s" repeatCount="indefinite"></animateTransform>
          </circle>
        </g>
        <g transform="rotate(180) translate(34 0)">
          <circle cx="0" cy="0" r="8" fill={fill}>
            <animate attributeName="opacity" from="1" to="0.1" begin="0.5s" dur="1s" repeatCount="indefinite"></animate>
            <animateTransform attributeName="transform" type="scale" from="1.5" to="1" begin="0.5s" dur="1s" repeatCount="indefinite"></animateTransform>
          </circle>
        </g>
        <g transform="rotate(225) translate(34 0)">
          <circle cx="0" cy="0" r="8" fill={fill}>
            <animate attributeName="opacity" from="1" to="0.1" begin="0.62s" dur="1s" repeatCount="indefinite"></animate>
            <animateTransform attributeName="transform" type="scale" from="1.5" to="1" begin="0.62s" dur="1s" repeatCount="indefinite"></animateTransform>
          </circle>
        </g>
        <g transform="rotate(270) translate(34 0)">
          <circle cx="0" cy="0" r="8" fill={fill}>
            <animate attributeName="opacity" from="1" to="0.1" begin="0.75s" dur="1s" repeatCount="indefinite"></animate>
            <animateTransform attributeName="transform" type="scale" from="1.5" to="1" begin="0.75s" dur="1s" repeatCount="indefinite"></animateTransform>
          </circle>
        </g>
        <g transform="rotate(315) translate(34 0)">
          <circle cx="0" cy="0" r="8" fill={fill}>
            <animate attributeName="opacity" from="1" to="0.1" begin="0.87s" dur="1s" repeatCount="indefinite"></animate>
            <animateTransform attributeName="transform" type="scale" from="1.5" to="1" begin="0.87s" dur="1s" repeatCount="indefinite"></animateTransform>
          </circle>
        </g>
      </g>
    </svg>
  )
}
