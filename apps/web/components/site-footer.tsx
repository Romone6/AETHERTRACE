import Link from "next/link";
import AethertraceMark from "@/components/aethertrace-mark";

export default function SiteFooter() {
  return <footer className="site-footer"><Link className="wordmark" href="/"><AethertraceMark /><span>AETHERTRACE</span></Link><p>Evidence-aware exploration of the infrared sky.</p><span>REAL ARCHIVE · CLEAR LIMITATIONS</span></footer>;
}
