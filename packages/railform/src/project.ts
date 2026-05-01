export type ProjectProps = {
	name: string;
};

export class Project {
	constructor(private props: ProjectProps) {}

	public get name(): string {
		return this.props.name;
    }

    
}
