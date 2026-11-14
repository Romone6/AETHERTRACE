import Link from "next/link";
import AethertraceMark from "@/components/aethertrace-mark";

export default function SiteFooter() {
  return <footer className="site-footer"><Link className="wordmark" href="/"><AethertraceMark /><span>AETHERTRACE</span></Link><a href="https://irsa.ipac.caltech.edu/Missions/spherex.html">NASA/IPAC Infrared Science Archive</a></footer>;
}
