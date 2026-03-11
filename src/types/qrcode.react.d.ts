declare module "qrcode.react" {
  import type { SVGProps } from "react";

  export interface QRCodeSVGProps extends SVGProps<SVGSVGElement> {
    value: string;
    size?: number;
    level?: "L" | "M" | "Q" | "H";
    bgColor?: string;
    fgColor?: string;
    includeMargin?: boolean;
    marginSize?: number;
    minVersion?: number;
    imageSettings?: {
      src: string;
      height: number;
      width: number;
      excavate?: boolean;
      x?: number;
      y?: number;
      opacity?: number;
    };
  }

  export function QRCodeSVG(props: QRCodeSVGProps): JSX.Element;
}
