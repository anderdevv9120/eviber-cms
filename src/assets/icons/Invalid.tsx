import React from "react";

type InvalidIconType = {
  width?: number;
  height?: number;
};

const InvalidIcon = ({ width, height }: InvalidIconType) => (
  <svg width={width} height={height} fill='none' xmlns='http://www.w3.org/2000/svg'>
    <path
      fillRule='evenodd'
      clipRule='evenodd'
      d='M20 10c0 5.523-4.477 10-10 10S0 15.523 0 10 4.477 0 10 0s10 4.477 10 10ZM9 4a1 1 0 1 1 2 0v8a1 1 0 1 1-2 0V4Zm1 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z'
      fill='#FD1D1D'
    />
  </svg>
);

InvalidIcon.defaultProps = {
  width: 20,
  height: 20
};
export default InvalidIcon;
