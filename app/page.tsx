import { DemoFront } from "@/components/DemoFront";
import { HomeClient } from "@/components/HomeClient";

export default function Home() {
  return <HomeClient front={<DemoFront />} />;
}
