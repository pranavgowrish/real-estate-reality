interface GradeCardProps {
  title: string;
  grade: React.ReactNode;
}

function GradeCard(props: GradeCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-2xl p-4 border-2 border-pink-200 text-gray-700 ">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">{props.title}</p>
        <span className="text-xl font-bold">{props.grade}</span>
      </div>
    </div>
  );
}
export default GradeCard;
