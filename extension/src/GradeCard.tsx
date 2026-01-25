interface GradeCardProps {
  title: string;
  grade: React.ReactNode;
}

function GradeCard(props: GradeCardProps) {
  return (
    <div className="rounded-xl shadow-2xl p-4 border-[3.6px] font-semibold border-[#006aff]">
      <div className="flex items-center font-bold justify-between">
        <p className="text-base font-bold ">{props.title}</p>
        <span className="text-lg font-extrabold ">{props.grade}</span>
      </div>
    </div>
  );
}
export default GradeCard;