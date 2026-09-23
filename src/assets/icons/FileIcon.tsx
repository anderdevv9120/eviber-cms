type FileIconType = {
  color?: string;
  width?: number;
  height?: number;
};

const FileIcon = ({ width, height, color }: FileIconType) => (
  <svg width={width} height={height} fill='none' xmlns='http://www.w3.org/2000/svg'>
    <rect width={48} height={48} rx={8} fill={color} />
    <path
      fillRule='evenodd'
      clipRule='evenodd'
      d='M19 14a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-8a2 2 0 0 0-2-2h-3a2 2 0 0 1-2-2v-3a2 2 0 0 0-2-2h-4Zm7.854.854a.5.5 0 0 0-.854.353V19a1 1 0 0 0 1 1h3.793a.5.5 0 0 0 .353-.854l-4.292-4.292Z'
      fill='#A3A3A3'
    />
  </svg>
);

FileIcon.defaultProps = {
  color: "#E8E8E8",
  width: 48,
  height: 48
};

export default FileIcon;
